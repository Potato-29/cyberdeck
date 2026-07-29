#include <WiFi.h>
#include <WebServer.h>
#include <ESP32Servo.h>
#include <esp_task_wdt.h>

// Replace with your network credentials
const char* ssid = "Bhikhumatre";
const char* password = "kkdubey69420";

IPAddress local_IP(192, 168, 29, 203);
IPAddress gateway(192, 168, 29, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(1, 1, 1, 1);
IPAddress secondaryDNS(8, 8, 8, 8);

WebServer server(80);
Servo feederServo;

const int servoPin = 18; // Change based on your wiring

void handleFeed() {
    Serial.println("Feed command received!");
    
    // Trigger the feeder mechanism
    feederServo.write(180); // Rotate to feed position
    delay(3000);           // Wait for food to drop
    feederServo.write(0);  // Return to start
    
    server.send(200, "text/plain", "Feeding sequence complete");
}

void setup() {
    esp_task_wdt_init(30, true); // reboot if stuck for 30 seconds
    esp_task_wdt_add(NULL);
    Serial.begin(115200);
    delay(1000);
    feederServo.attach(servoPin);
    feederServo.write(0); // Set initial position

    if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
        Serial.println("Static IP config failed");
    }
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println("");
    Serial.print("Connected to WiFi. IP address: ");
    Serial.println(WiFi.localIP());

    // Define the endpoint
    server.on("/feed", HTTP_GET, handleFeed);
    
    server.begin();
    Serial.println("HTTP server started");
}

void loop() {
    esp_task_wdt_reset(); // feed watchdog every loop
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi lost — reconnecting...");
        WiFi.disconnect();
        if (!WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
            Serial.println("Static IP config failed on reconnect");
        }
        WiFi.begin(ssid, password);
        int attempts = 0;
        while (WiFi.status() != WL_CONNECTED && attempts < 20) {
            delay(500);
            attempts++;
        }
    }
    server.handleClient();
}