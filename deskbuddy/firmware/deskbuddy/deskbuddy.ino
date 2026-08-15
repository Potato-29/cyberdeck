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
// Board: "ESP32 Dev Module".  Wiring: see docs/deskbuddy.md.

#include <WiFi.h>
#include <Wire.h>
#include <ESP_I2S.h>
#include <WebSocketsClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>


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

// ── OLED ─────────────────────────────────────────────────────────────────────
#define SCREEN_W  128
#define SCREEN_H  64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);

// ── Audio ────────────────────────────────────────────────────────────────────
#define SAMPLE_RATE   16000
// readBytes() blocks until the whole block is in, so keep it short (256 = 16ms)
// or the eye animation and webSocket.loop() stall behind the mic.
#define BLOCK_SAMPLES 256         // samples per read/send; broker re-frames to 1280
#define USE_RIGHT_SLOT false      // INMP441 L/R -> GND = left slot

I2SClass i2s;
int32_t rawBuf[BLOCK_SAMPLES];    // INMP441 delivers 24-bit data in 32-bit slots
int16_t pcmBuf[BLOCK_SAMPLES];

// Smoothed 0..1 input level, computed here and drawn by the "listening" meter.
// Fast attack / slow decay, so a single short word still reads as a visible kick.
#define MIC_LEVEL_FULL 10000      // 16-bit peak treated as full scale — tune by eye
float micLevel = 0.0f;

// ── State ────────────────────────────────────────────────────────────────────
WebSocketsClient webSocket;
String buddyState = "idle";
bool   wsConnected = false;
unsigned long lastDraw = 0;

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
  int32_t peak = 0;
  for (int i = 0; i < n; i++) {
    float x   = (float)(rawBuf[i] >> MIC_GAIN_SHIFT);
    float y   = x - dcPrevIn + MIC_DC_R * dcPrevOut;
    dcPrevIn  = x;
    dcPrevOut = y;

    int32_t v = (int32_t)y;
    if (v > 32767) v = 32767; else if (v < -32768) v = -32768;
    pcmBuf[i] = (int16_t)v;

    int32_t a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }

  float lvl = (float)peak / MIC_LEVEL_FULL;
  if (lvl > 1.0f) lvl = 1.0f;
  micLevel = (lvl > micLevel) ? lvl : micLevel + (lvl - micLevel) * 0.25f;

  webSocket.sendBIN((uint8_t*)pcmBuf, n * sizeof(int16_t));
}

// ── Eyes ─────────────────────────────────────────────────────────────────────
// Two channels carry the state, because eye height alone was too subtle to read
// from across the desk:
//   1. eye SHAPE  — a different silhouette per state, not a few px of height
//   2. status BAND — rows 0..15, a different motif per state
// The band is also the yellow strip on the dual-colour SSD1306 modules (the top
// 16 rows have a yellow filter bonded to the glass), so on those panels the
// state reads as a colour change too. Keep all band drawing above y=16 and all
// eye drawing below it, or that effect breaks.
#define EYE_CY  40          // eye centre — keeps both eyes clear of the band

void drawEye(int x, int cy, int w, int h) {
  int r = min(6, h / 2);
  display.fillRoundRect(x, cy - h / 2, w, h, r, SSD1306_WHITE);
}

// Flat-bottomed dome — a distinct silhouette from the blocks, reads as a warm,
// curved-up eye for "speaking".
void drawDomeEye(int x, int cy, int w, int h) {
  display.fillRoundRect(x, cy - h / 2, w, h, min(10, h / 2), SSD1306_WHITE);
  display.fillRect(x - 1, cy, w + 2, h, SSD1306_BLACK);   // slice off the lower half
}

// Live input meter, centre-out. Only "listening" gets this, and it moves with
// your actual voice — the one unambiguous "it can hear me right now" cue.
void drawBandVU(float level) {
  int segs = (int)(level * 8.0f + 0.5f);
  for (int i = 0; i < segs && i < 8; i++) {
    int hgt = 4 + i;                                      // taller toward the edges
    display.fillRect(66 + i * 7, 13 - hgt, 5, hgt, SSD1306_WHITE);
    display.fillRect(57 - i * 7, 13 - hgt, 5, hgt, SSD1306_WHITE);
  }
}

// Three dots bouncing in sequence — "thinking".
void drawBandDots(float t) {
  for (int i = 0; i < 3; i++) {
    int y = 8 - (int)(sin(t * 3.0f - i * 0.6f) * 4.0f);
    display.fillCircle(52 + i * 12, y, 3, SSD1306_WHITE);
  }
}

// Travelling sine — "speaking". Moves right-to-left at a fixed rate, so it never
// looks like the VU meter even when the reply is quiet.
void drawBandWave(float t) {
  for (int x = 0; x < SCREEN_W; x++) {
    int y = 8 + (int)(sin(x * 0.18f - t * 9.0f) * 5.0f);
    display.drawPixel(x, y, SSD1306_WHITE);
    display.drawPixel(x, y + 1, SSD1306_WHITE);
  }
}

void drawEyes() {
  display.clearDisplay();
  float t = millis() / 1000.0f;
  const int lx = 26, rx = 78, w = 24;
  int  cyL = EYE_CY, cyR = EYE_CY, h = 24;
  bool dome = false;

  if (buddyState == "idle") {
    // Deliberately the SMALLEST eyes and an empty band. Idle is defined by what
    // it lacks, so it can't be mistaken for listening at a glance.
    bool blink = fmod(t, 3.2f) > 3.0f;           // quick blink every ~3.2s
    h = blink ? 2 : 10;
    cyL = cyR = EYE_CY + (int)(sin(t * 0.8f) * 2);
  } else if (buddyState == "listening") {
    h = 30 + (int)(micLevel * 6.0f);             // widest, and they swell with your voice
    drawBandVU(micLevel);
  } else if (buddyState == "thinking") {
    h = 6;                                       // narrowed to slits, looking up
    cyL = cyR = EYE_CY - 4;
    drawBandDots(t);
  } else if (buddyState == "speaking") {
    h = 26 + (int)(fabs(sin(t * 7.0f)) * 8);
    dome = true;
    drawBandWave(t);
  } else if (buddyState == "error") {
    for (int cx : {lx + w / 2, rx + w / 2}) {    // X eyes
      display.drawLine(cx - 11, EYE_CY - 11, cx + 11, EYE_CY + 11, SSD1306_WHITE);
      display.drawLine(cx + 11, EYE_CY - 11, cx - 11, EYE_CY + 11, SSD1306_WHITE);
    }
    for (int x = 0; x < SCREEN_W; x += 8)        // dashed band — something is wrong
      display.fillRect(x, 4, 4, 8, SSD1306_WHITE);
    display.display();
    return;
  }

  if (dome) {
    drawDomeEye(lx, cyL, w, h);
    drawDomeEye(rx, cyR, w, h);
  } else {
    drawEye(lx, cyL, w, h);
    drawEye(rx, cyR, w, h);
  }
  display.display();
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
  display.clearDisplay();
  display.display();

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

  if (millis() - lastDraw > 50) {   // ~20fps eye refresh
    drawEyes();
    lastDraw = millis();
  }
}
