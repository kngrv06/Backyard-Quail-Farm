/*
  Quail Farm Controller v21.0 - PRO
  - Automatic Reset for Feed/Waste Cleaner Flags in Firestore
  - Improved Timer Logic for Jog Buttons
  - Real-time Sync with Dashboard
*/

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>

// WiFi & Firebase Config
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define API_KEY "YOUR_FIREBASE_API_KEY"
#define PROJECT_ID "YOUR_PROJECT_ID"
#define USER_EMAIL "YOUR_USER_EMAIL"
#define USER_PASSWORD "YOUR_USER_PASSWORD"

// Pin Definitions
#define SHT_SCL 22
#define SHT_SDA 21
#define AMM_PIN 34
#define TRIG_1 5
#define ECHO_1 18
#define TRIG_2 19
#define ECHO_2 23
#define TRIG_3 25
#define ECHO_3 26

#define FAN_PIN 13
#define HEATER_PIN 14
#define LIGHT_PIN 27
#define CLEANER_PIN 32
#define FEED_1 33

// Global Objects
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// State Variables
float temp = 0, hum = 0;
int amm = 0;
int f1 = 0, f2 = 0, f3 = 0;

bool autoM = false;
bool fActive = false;
bool cActive = false;
unsigned long fTimerEnd = 0;
unsigned long cTimerEnd = 0;
int fDur = 10; // Default 10s
int cDur = 10; // Default 10s

void setup() {
  Serial.begin(115200);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(HEATER_PIN, OUTPUT);
  pinMode(LIGHT_PIN, OUTPUT);
  pinMode(CLEANER_PIN, OUTPUT);
  pinMode(FEED_1, OUTPUT);
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  
  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

long getDist(int t, int e) {
  digitalWrite(t, LOW); delayMicroseconds(2);
  digitalWrite(t, HIGH); delayMicroseconds(10);
  digitalWrite(t, LOW);
  return pulseIn(e, HIGH) * 0.034 / 2;
}

void loop() {
  if (Firebase.ready()) {
    // 1. Read Controls & Settings
    String path = "farms/main-farm";
    if (Firebase.Firestore.getDocument(&fbdo, PROJECT_ID, "", path.c_str(), "")) {
      FirebaseJson &js = fbdo.to<FirebaseJson>();
      FirebaseJsonData da;
      
      // Auto Mode
      if (js.get(da, "fields/autoMode/booleanValue")) autoM = da.boolValue;
      
      // Relay Controls
      if (js.get(da, "fields/controls/mapValue/fields/fan/booleanValue")) digitalWrite(FAN_PIN, da.boolValue ? HIGH : LOW);
      if (js.get(da, "fields/controls/mapValue/fields/heater/booleanValue")) digitalWrite(HEATER_PIN, da.boolValue ? HIGH : LOW);
      if (js.get(da, "fields/controls/mapValue/fields/light/booleanValue")) digitalWrite(LIGHT_PIN, da.boolValue ? HIGH : LOW);
      
      // Manual Trigger: Feed
      if (!fActive && js.get(da, "fields/controls/mapValue/fields/feed/booleanValue") && da.boolValue) {
        fActive = true;
        fTimerEnd = millis() + (fDur * 1000);
        digitalWrite(FEED_1, HIGH);
        Serial.println("Feed Started");
      }
      
      // Manual Trigger: Cleaner
      if (!cActive && js.get(da, "fields/controls/mapValue/fields/cleaner/booleanValue") && da.boolValue) {
        cActive = true;
        cTimerEnd = millis() + (cDur * 1000);
        digitalWrite(CLEANER_PIN, HIGH);
        Serial.println("Cleaner Started");
      }
    }

    // 2. Handle Timers (Jog Logic)
    if (fActive && millis() > fTimerEnd) {
      fActive = false;
      digitalWrite(FEED_1, LOW);
      Serial.println("Feed Finished - Resetting Firestore Flag");
      resetFlag("feed");
    }
    
    if (cActive && millis() > cTimerEnd) {
      cActive = false;
      digitalWrite(CLEANER_PIN, LOW);
      Serial.println("Cleaner Finished - Resetting Firestore Flag");
      resetFlag("cleaner");
    }

    // 3. Update Sensors (Every 15s)
    static unsigned long lastSens = 0;
    if (millis() - lastSens > 15000) {
      lastSens = millis();
      // Dummy sensor read for example
      temp = 25.5 + random(-2, 2);
      amm = random(100, 2000);
      f1 = map(getDist(TRIG_1, ECHO_1), 2, 30, 100, 0); 
      
      FirebaseJson update;
      update.set("fields/temperature/doubleValue", temp);
      update.set("fields/ammonia/integerValue", amm);
      update.set("fields/feedLevel/integerValue", constrain(f1, 0, 100));
      update.set("fields/lastUpdate/stringValue", "2026-04-24T00:00:00Z"); // Use NTP for real time
      
      Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", path.c_str(), update.raw(), "temperature,ammonia,feedLevel,lastUpdate");
    }
  }
}

void resetFlag(String field) {
  FirebaseJson update;
  update.set("fields/controls/mapValue/fields/" + field + "/booleanValue", false);
  Firebase.Firestore.patchDocument(&fbdo, PROJECT_ID, "", "farms/main-farm", update.raw(), "controls." + field);
}
