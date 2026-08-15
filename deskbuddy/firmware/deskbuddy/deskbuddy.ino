// Desk Buddy — ESP32 firmware (phase 1)
//
// Thin audio + display client. Streams 16kHz/16-bit mono mic PCM to the phone
// broker over a WebSocket, and animates "eyes" on an SSD1306 OLED from the
// state the broker pushes back (idle / listening / thinking / speaking / error).
//
// Phase 1 has NO audio output — replies play on the phone speaker. The GF1002
// amp + speaker (DAC on GPIO25) come in phase 2, when the speaker wire arrives.
//
// Libraries (Library Manager):
//   - WebSockets            by Markus Sattler  (links2004/arduinoWebSockets)
//   - Adafruit SSD1306      + Adafruit GFX
//   - FluxGarage RoboEyes   by Dennis Hoelscher — drives the eye animation
// Board: "ESP32 Dev Module".  Wiring: see docs/deskbuddy.md.

#include <WiFi.h>
#include <Wire.h>
#include <ESP_I2S.h>
#include <WebSocketsClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
// ── OLED ─────────────────────────────────────────────────────────────────────
#define SCREEN_W  128
#define SCREEN_H  64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);


// Included last on purpose: RoboEyes #defines very generic macros (DEFAULT, ON,
// OFF, N, E, S, W …) that would otherwise leak into the headers above.
#include <FluxGarage_RoboEyes.h>
RoboEyes<Adafruit_SSD1306> roboEyes(display);   // template param = display driver

// Wi-Fi the ESP32 joins (must be the same LAN as the phone broker)
#define WIFI_SSID   "Phone_1_1678"
#define WIFI_PASS   "12345678"

// The phone's LAN IP running deskbuddy/broker.py (inside proot), and its port
#define BROKER_HOST "10.238.133.125"
#define BROKER_PORT 2125


// INMP441 input gain, as a right-shift of the raw 32-bit slot down to 16-bit.
// 13 is the value validated by firmware/mic_test — raise by 1 if it clips,
// lower by 1 if it's too quiet. Shifting (rather than >>16 then multiplying)
// keeps the low bits the INMP441 actually puts signal in.
#define MIC_GAIN_SHIFT 13

// One-pole DC blocker. The INMP441 has a large DC offset that otherwise eats
// headroom and skews the wake word's input.
#define MIC_DC_R    0.995f


// ── Pins ─────────────────────────────────────────────────────────────────────
#define I2S_SCK   14          // INMP441 SCK (bit clock)
#define I2S_WS    27          // INMP441 WS  (word select / LR clock)
#define I2S_SD    32          // INMP441 SD  (serial data out)
#define BOOT_BTN  0           // onboard BOOT button — optional manual trigger



// ── Audio ────────────────────────────────────────────────────────────────────
#define SAMPLE_RATE   16000
// readBytes() blocks until the whole block is in, so keep it short (256 = 16ms)
// or the eye animation and webSocket.loop() stall behind the mic.
#define BLOCK_SAMPLES 256         // samples per read/send; broker re-frames to 1280
#define USE_RIGHT_SLOT false      // INMP441 L/R -> GND = left slot

I2SClass i2s;
int32_t rawBuf[BLOCK_SAMPLES];    // INMP441 delivers 24-bit data in 32-bit slots
int16_t pcmBuf[BLOCK_SAMPLES];

// ── State ────────────────────────────────────────────────────────────────────
WebSocketsClient webSocket;
String buddyState = "idle";
bool   wsConnected = false;

// ── I2S mic init ─────────────────────────────────────────────────────────────
// Same setup as firmware/mic_test, which is the one that's been verified to
// produce clean audio on this board. Don't drift from it without re-testing there.
void initMic() {
  i2s.setPins(I2S_SCK, I2S_WS, -1, I2S_SD);   // sck, ws, dout (unused), din
  i2s.setTimeout(100);                        // ms; bounds a read on a dead mic
  if (!i2s.begin(I2S_MODE_STD,
                 SAMPLE_RATE,
                 I2S_DATA_BIT_WIDTH_32BIT,
                 I2S_SLOT_MODE_MONO,
                 USE_RIGHT_SLOT ? I2S_STD_SLOT_RIGHT : I2S_STD_SLOT_LEFT)) {
    Serial.println("[mic] I2S init failed");
  }
}

// Read one block, convert 32-bit slots to 16-bit PCM, stream over the WebSocket.
void pumpAudio() {
  if (!wsConnected) return;
  size_t got = i2s.readBytes((char*)rawBuf, sizeof(rawBuf));
  int n = got / sizeof(int32_t);
  if (n == 0) return;

  static float dcPrevIn = 0.0f, dcPrevOut = 0.0f;   // DC blocker state, per-sample
  for (int i = 0; i < n; i++) {
    float x   = (float)(rawBuf[i] >> MIC_GAIN_SHIFT);
    float y   = x - dcPrevIn + MIC_DC_R * dcPrevOut;
    dcPrevIn  = x;
    dcPrevOut = y;

    int32_t v = (int32_t)y;
    if (v > 32767) v = 32767; else if (v < -32768) v = -32768;
    pcmBuf[i] = (int16_t)v;
  }
  webSocket.sendBIN((uint8_t*)pcmBuf, n * sizeof(int16_t));
}

// ── Eyes ─────────────────────────────────────────────────────────────────────
// RoboEyes (FluxGarage) owns the whole 128x64 buffer — its update() calls
// clearDisplay() and display() itself — so nothing else may draw to the screen.
//
// Its setters are LATCHES, not per-frame calls: setMood/setCuriosity/setSweat
// persist until changed, and anim_confused()/blink() are one-shots that must not
// be retriggered every frame. So applyEyeState() runs ONCE per state transition,
// and resets every latch it can set at the top — otherwise the sweat drops from
// "thinking" would still be there during "speaking".
#define EYE_FPS 25          // a full 128x64 I2C push is ~23ms at 400kHz, so this
                            // is a real CPU cost next to pumpAudio() — keep it modest
#define EYE_W   36
#define EYE_H   36

String eyeState = "";       // last state handed to applyEyeState()

void applyEyeState(const String& s) {
  // Clear every latch first so states can't bleed into each other.
  roboEyes.setMood(DEFAULT);
  roboEyes.setPosition(DEFAULT);
  roboEyes.setCuriosity(OFF);
  roboEyes.setSweat(OFF);
  roboEyes.setHFlicker(OFF);
  roboEyes.setVFlicker(OFF);
  roboEyes.setIdleMode(OFF);
  roboEyes.setAutoblinker(OFF);
  roboEyes.setWidth(EYE_W, EYE_W);
  roboEyes.setHeight(EYE_H, EYE_H);

  if (s == "idle") {
    // Relaxed: slightly lidded, blinking, eyes wandering the room.
    roboEyes.setHeight(EYE_H - 8, EYE_H - 8);
    roboEyes.setAutoblinker(ON, 3, 2);
    roboEyes.setIdleMode(ON, 2, 2);
  } else if (s == "listening") {
    // Locked on: wide, centred, no wandering, rarely blinks.
    roboEyes.setHeight(EYE_H + 6, EYE_H + 6);
    roboEyes.setCuriosity(ON);
    roboEyes.setAutoblinker(ON, 5, 3);
  } else if (s == "thinking") {
    // Pondering: tired lids, a sweat drop, eyes darting, one confused shake.
    roboEyes.setMood(TIRED);
    roboEyes.setSweat(ON);
    roboEyes.setIdleMode(ON, 1, 1);
    roboEyes.anim_confused();
  } else if (s == "speaking") {
    // Talking: smiling lids, with a vertical bob standing in for a mouth.
    roboEyes.setMood(HAPPY);
    roboEyes.setVFlicker(ON, 2);
    roboEyes.setAutoblinker(ON, 4, 2);
  } else if (s == "error") {
    roboEyes.setMood(ANGRY);
    roboEyes.setHFlicker(ON, 3);
  }
}

// ── WebSocket events ─────────────────────────────────────────────────────────
void wsEvent(WStype_t type, uint8_t* payload, size_t len) {
  switch (type) {
    case WStype_CONNECTED:
      wsConnected = true;
      Serial.println("[ws] connected");
      break;
    case WStype_DISCONNECTED:
      wsConnected = false;
      buddyState = "error";
      Serial.println("[ws] disconnected");
      break;
    case WStype_TEXT: {
      // Tiny parse — avoid an ArduinoJson dependency for one field.
      String s = String((char*)payload).substring(0, len);
      for (const char* st : {"listening", "thinking", "speaking", "error", "idle"}) {
        if (s.indexOf(st) >= 0) { buddyState = st; break; }
      }
      break;
    }
    default:
      break;
  }
}

// ── WiFi ─────────────────────────────────────────────────────────────────────
void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("[wifi] connecting");
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(500); Serial.print("."); tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[wifi] "); Serial.println(WiFi.localIP());
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(BOOT_BTN, INPUT_PULLUP);

  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("[oled] SSD1306 not found");
  }
  // begin() starts with closed eyes, so they blink open on boot.
  roboEyes.begin(SCREEN_W, SCREEN_H, EYE_FPS);
  roboEyes.setBorderradius(12, 12);
  roboEyes.setSpacebetween(12);
  // Per-state behaviour is applied by applyEyeState() on the first loop pass,
  // since eyeState starts empty and buddyState starts "idle".

  connectWifi();
  initMic();

  webSocket.begin(BROKER_HOST, BROKER_PORT, "/ws");
  webSocket.onEvent(wsEvent);
  webSocket.setReconnectInterval(3000);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    wsConnected = false;
    buddyState = "error";
    connectWifi();
  }

  webSocket.loop();
  pumpAudio();

  // BOOT button: local visual test of the "listening" eyes (no broker needed)
  if (digitalRead(BOOT_BTN) == LOW) buddyState = "listening";

  // Hand state changes to the eyes once each, never per frame.
  if (buddyState != eyeState) {
    eyeState = buddyState;
    applyEyeState(eyeState);
  }

  // Self-limiting: no-ops until EYE_FPS's frame interval has elapsed.
  roboEyes.update();
}
