/**
 * AEGIS Tactical Autonomous SIGINT Sensor
 * Target: ESP8266
 * Capability: Automated Server Discovery + SIGINT Multi-Node Reporting
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiUdp.h>

// --- TACTICAL CONFIGURATION ---
const char* wifi_ssid = "Home";
const char* wifi_password = "Lion@2020";
const char* node_id = "ESP_SIGINT_01";
const char* api_key = "AEGIS_TACTICAL_KEY_2026";
const int udpPort = 5555;
// ------------------------------

WiFiUDP udp;
String server_ip = "";
String server_url = "";
String grid_state = "STANDBY";
char incomingPacket[255];

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifi_ssid, wifi_password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[+] AUTO_NODE ONLINE. Starting Tactical Discovery...");
  udp.begin(udpPort);
}

void discoverServer() {
  Serial.println("[*] Hunting for AEGIS Beacon...");
  while (server_ip == "") {
    int packetSize = udp.parsePacket();
    if (packetSize) {
      int len = udp.read(incomingPacket, 255);
      if (len > 0) incomingPacket[len] = 0;
      
      String msg = String(incomingPacket);
      if (msg.startsWith("AEGIS_SERVER|")) {
        // Parse: AEGIS_SERVER|IP|PORT|STATE
        int f1 = msg.indexOf('|');
        int f2 = msg.indexOf('|', f1 + 1);
        int f3 = msg.indexOf('|', f2 + 1);
        
        server_ip = msg.substring(f1 + 1, f2);
        grid_state = msg.substring(f3 + 1);
        server_url = "http://" + server_ip + ":8000/api/external/scan";
        Serial.println("[+] BEACON ACQUIRED. Hub Location: " + server_url);
        Serial.println("[*] INITIAL GRID STATE: " + grid_state);
      }
    }
    delay(100);
  }
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.begin(wifi_ssid, wifi_password);
    return;
  }

  // Check for Beacon Updates (State Changes)
  int packetSize = udp.parsePacket();
  if (packetSize) {
    int len = udp.read(incomingPacket, 255);
    if (len > 0) incomingPacket[len] = 0;
    String msg = String(incomingPacket);
    if (msg.startsWith("AEGIS_SERVER|")) {
      int f1 = msg.indexOf('|');
      int f2 = msg.indexOf('|', f1 + 1);
      int f3 = msg.indexOf('|', f2 + 1);
      grid_state = msg.substring(f3 + 1);
    }
  }

  // Ensure we have a locked server target
  if (server_ip == "") {
    discoverServer();
  }

  // ONLY SCAN IF GRID IS ACTIVE
  if (grid_state == "ACTIVE") {
    int n = WiFi.scanNetworks();
    Serial.printf("[*] SIGINT Scan Engaged: Found %d APs\n", n);

    if (n > 0) {
      WiFiClient client;
      HTTPClient http;
      http.begin(client, server_url);
      http.addHeader("Content-Type", "application/json");

      String json = "{\"node_id\": \"" + String(node_id) + "\", \"api_key\": \"" + String(api_key) + "\", \"networks\": [";
      for (int i = 0; i < n; ++i) {
        json += "{\"ssid\": \"" + WiFi.SSID(i) + "\", \"bssid\": \"" + WiFi.BSSIDstr(i) + "\", \"rssi\": " + String(WiFi.RSSI(i)) + ", \"channel\": " + String(WiFi.channel(i)) + "}";
        if (i < n - 1) json += ",";
      }
      json += "]}";

      int httpCode = http.POST(json);
      if (httpCode > 0) {
        Serial.printf("[+] Sync successful. Code: %d\n", httpCode);
      } else {
        Serial.printf("[-] LINK LOST. Server unreachable. Reverting to Hub Hunt.\n");
        server_ip = ""; // Force re-discovery if transmission fails
      }
      http.end();
    }
  } else {
    Serial.println("[!] GRID STANDBY. Scanning Suspended.");
  }

  delay(10000); // 10s check cycle
}
