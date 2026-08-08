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
#include <driver/i2s.h>
#include <esp_task_wdt.h>
#include <WebSocketsClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#include "secrets.h"   // WIFI_SSID, WIFI_PASS, BROKER_HOST, BROKER_PORT, MIC_GAIN

// ── Pins ─────────────────────────────────────────────────────────────────────
#define I2S_SCK   14          // INMP441 SCK (bit clock)
#define I2S_WS    15          // INMP441 WS  (word select / LR clock)
#define I2S_SD    32          // INMP441 SD  (serial data out)
#define I2S_PORT  I2S_NUM_0
#define BOOT_BTN  0           // onboard BOOT button — optional manual trigger

// ── OLED ─────────────────────────────────────────────────────────────────────
#define SCREEN_W  128
#define SCREEN_H  64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_W, SCREEN_H, &Wire, -1);

// ── Audio ────────────────────────────────────────────────────────────────────
#define SAMPLE_RATE   16000
#define BLOCK_SAMPLES 1024        // samples per read/send; broker re-frames to 1280
int32_t rawBuf[BLOCK_SAMPLES];    // INMP441 delivers 24-bit data in 32-bit slots
int16_t pcmBuf[BLOCK_SAMPLES];

// ── State ────────────────────────────────────────────────────────────────────
WebSocketsClient webSocket;
String buddyState = "idle";
bool   wsConnected = false;
unsigned long lastDraw = 0;

// ── I2S mic init ─────────────────────────────────────────────────────────────
void initMic() {
  i2s_config_t cfg = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,   // INMP441 L/R -> GND = left
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 6,
    .dma_buf_len = 256,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };
  i2s_pin_config_t pins = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };
  i2s_driver_install(I2S_PORT, &cfg, 0, NULL);
  i2s_set_pin(I2S_PORT, &pins);
  i2s_zero_dma_buffer(I2S_PORT);
}

// Read one block, convert 32-bit slots to 16-bit PCM, stream over the WebSocket.
void pumpAudio() {
  if (!wsConnected) return;
  size_t bytesRead = 0;
  if (i2s_read(I2S_PORT, rawBuf, sizeof(rawBuf), &bytesRead, 20 / portTICK_PERIOD_MS) != ESP_OK)
    return;
  int n = bytesRead / sizeof(int32_t);
  for (int i = 0; i < n; i++) {
    int32_t v = (rawBuf[i] >> 16) * MIC_GAIN;   // top 16 bits, then tune gain
    if (v > 32767) v = 32767; else if (v < -32768) v = -32768;
    pcmBuf[i] = (int16_t)v;
  }
  webSocket.sendBIN((uint8_t*)pcmBuf, n * sizeof(int16_t));
}

// ── Eyes ─────────────────────────────────────────────────────────────────────
void drawEye(int x, int cy, int w, int h) {
  int r = min(6, h / 2);
  display.fillRoundRect(x, cy - h / 2, w, h, r, SSD1306_WHITE);
}

void drawEyes() {
  display.clearDisplay();
  float t = millis() / 1000.0f;
  const int lx = 26, rx = 78, w = 24;
  int cyL = 32, cyR = 32, h = 26;

  if (buddyState == "idle") {
    bool blink = fmod(t, 3.2f) > 3.0f;           // quick blink every ~3.2s
    h = blink ? 3 : 26;
    cyL = cyR = 32 + (int)(sin(t * 0.8f) * 2);
  } else if (buddyState == "listening") {
    h = 30 + (int)(sin(t * 6.0f) * 3);           // wide, alert
  } else if (buddyState == "thinking") {
    h = 18; cyL = cyR = 26;                        // narrowed, looking up
    int dx = 64 + (int)(cos(t * 4.0f) * 30);
    int dy = 30 + (int)(sin(t * 4.0f) * 10);
    display.fillCircle(dx, dy, 3, SSD1306_WHITE);  // orbiting thought dot
  } else if (buddyState == "speaking") {
    float b = fabs(sin(t * 7.0f));
    h = 18 + (int)(b * 12); cyL = cyR = 32 - (int)(b * 2);
  } else if (buddyState == "error") {
    for (int cx : {lx + w / 2, rx + w / 2}) {      // X eyes
      display.drawLine(cx - 11, 21, cx + 11, 43, SSD1306_WHITE);
      display.drawLine(cx + 11, 21, cx - 11, 43, SSD1306_WHITE);
    }
    display.display();
    return;
  }
  drawEye(lx, cyL, w, h);
  drawEye(rx, cyR, w, h);
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
    esp_task_wdt_reset();
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[wifi] "); Serial.println(WiFi.localIP());
  }
}

void setup() {
  esp_task_wdt_init(30, true);
  esp_task_wdt_add(NULL);
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
  esp_task_wdt_reset();

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
