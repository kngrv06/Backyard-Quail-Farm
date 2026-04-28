#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <time.h> 
#include <DHT.h>
#include <addons/TokenHelper.h>
#include <algorithm> 

// --- [1] CONFIGURATION ---
// PAALALA: Siguraduhin na tama ang iyong credentials dito.
#define WIFI_SSID "BAWAL_KOMONEK"
#define WIFI_PASSWORD "Dominador21"
#define API_KEY "AIzaSyDrMzg474vkTUcW0AY2watoK_UPpDEcAN8"
#define PROJECT_ID "gen-lang-client-0260680081"
#define DATABASE_ID "ai-studio-187c0557-cd0e-4fcf-962e-a8c0d04a4c80"
#define USER_EMAIL "quailsmart@gmail.com"
#define USER_PASSWORD "Pugo123!"

// --- [2] PIN DEFINITIONS ---
#define DHTPIN 16
#define MQ137_PIN 34
#define FAN_PIN 26
#define LIGHT_PIN 25
#define HEATER_1 33
#define HEATER_2 32
#define STOOL_PIN 27
#define FEED_1 5
#define FEED_2 18
#define FEED_3 19
#define TRIG_1 4
#define ECHO_1 0
#define TRIG_2 14
#define ECHO_2 12
#define TRIG_3 13
#define ECHO_3 15

DHT dht(DHTPIN, DHT22);
FirebaseData fbdo_main; 
FirebaseData fbdo_settings; 
FirebaseData fbdo_log; 
FirebaseAuth auth;
FirebaseConfig config;

// --- [3] DYNAMIC VARIABLES ---
bool autoMode = false;
bool fanS = false, heatS = false, lightS = false;
String fTime = "", cTime = "", lStart = "", lEnd = "";
int fDur = 5, cDur = 10;
unsigned long lastSync = 0;
bool fActive = false, cActive = false;
unsigned long fTimerEnd = 0, cTimerEnd = 0;
String lastHour = "", lastFeedTrigger = "", lastCleanTrigger = "";

void setup() {
  Serial.begin(115200); 
  dht.begin();
  pinMode(FAN_PIN, OUTPUT); pinMode(LIGHT_PIN, OUTPUT);
  pinMode(HEATER_1, OUTPUT); pinMode(HEATER_2, OUTPUT);
  pinMode(STOOL_PIN, OUTPUT); pinMode(FEED_1, OUTPUT);
  pinMode(FEED_2, OUTPUT); pinMode(FEED_3, OUTPUT);
  pinMode(TRIG_1, OUTPUT); pinMode(ECHO_1, INPUT);
  pinMode(TRIG_2, OUTPUT); pinMode(ECHO_2, INPUT);
  pinMode(TRIG_3, OUTPUT); pinMode(ECHO_3, INPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi Connected!");
  
  // Set time for Logging (GMT+8 for Philippines)
  configTime(28800, 0, "pool.ntp.org", "time.google.com"); 

  config.api_key = API_KEY;
  auth.user.email = USER_EMAIL; auth.user.password = USER_PASSWORD;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

// --- [HISTORY LOGGER] ---
// Nililigtas ang sensor data bawat oras sa "history" collection.
void hourlyHistoryLogger(String nH, float t, float h, int a) {
  if (nH == "" || nH == lastHour) return; 
  struct tm ti; if(!getLocalTime(&ti)) return;
  
  // Format doc name: hourly_YYYY-MM-DD_HH (Unique document per hour)
  char buf[25]; strftime(buf, sizeof(buf), "%Y-%m-%d_%H", &ti);
  String docId = "hourly_" + String(buf);
  String path = "farms/main-farm/history/" + docId;
  
  FirebaseJson j;
  j.set("fields/temperature/doubleValue", (double)t); 
  j.set("fields/humidity/doubleValue", (double)h);
  j.set("fields/ammonia/doubleValue", (double)a);
  
  char iso[35]; strftime(iso, sizeof(iso), "%Y-%m-%dT%H:00:00+08:00", &ti);
  j.set("fields/timestamp/stringValue", String(iso));

  // I-patch sa Firestore (Mag-ecreate kung wala pa)
  if (Firebase.Firestore.patchDocument(&fbdo_log, PROJECT_ID, DATABASE_ID, path.c_str(), j.raw(), "temperature,humidity,ammonia,timestamp")) {
    Serial.println(">>> [Trend Success] History Log Saved: " + docId);
    lastHour = nH; 
  } else {
    Serial.print(">>> [Trend Error]: ");
    Serial.println(fbdo_log.errorReason());
  }
}

float getStableDist(int trig, int echo) {
  float readings[10]; int count = 0;
  for(int i = 0; i < 10; i++) {
    digitalWrite(trig, LOW); delayMicroseconds(2);
    digitalWrite(trig, HIGH); delayMicroseconds(10);
    digitalWrite(trig, LOW);
    long dur = pulseIn(echo, HIGH, 25000);
    if (dur > 0) { readings[count] = dur * 0.034 / 2; count++; }
    delay(5);
  }
  if (count == 0) return 20.0;
  std::sort(readings, readings + count);
  return readings[count / 2];
}

int calculateSteppedLevel(float dist, float empty) {
  float full = 3.5; 
  if (dist >= empty) return 0;
  float rawPerc = (empty - dist) / (empty - full) * 100.0;
  if (rawPerc >= 90) return 100;
  if (rawPerc >= 75) return 80;
  if (rawPerc >= 55) return 60;
  if (rawPerc >= 35) return 40;
  if (rawPerc >= 15) return 20; 
  return 0;
}

bool isInTimeRange(String now, String s, String e) {
  if (s == "" || e == "" || now == "") return false;
  if (s < e) return (now >= s && now < e);
  return (now >= s || now < e);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) { WiFi.begin(WIFI_SSID, WIFI_PASSWORD); delay(2000); return; }
  
  struct tm ti; String nT = "", nH = "";
  if(getLocalTime(&ti)){
    char bT[6], bH[3]; 
    sprintf(bT, "%02d:%02d", ti.tm_hour, ti.tm_min); nT = String(bT);
    sprintf(bH, "%02d", ti.tm_hour); nH = String(bH);
  }

  // 1. SENSOR READINGS
  float t = dht.readTemperature(); 
  float h = dht.readHumidity(); 
  int a = analogRead(MQ137_PIN);
  float d1 = getStableDist(TRIG_1, ECHO_1);
  float d2 = getStableDist(TRIG_2, ECHO_2);
  float d3 = getStableDist(TRIG_3, ECHO_3);
  
  // Debug sensors
  if (isnan(t)) {
    Serial.println("DHT ERROR: Is it connected to PIN 16?");
    t = 0.0;
  }

  // 2. TREND LOGGING (Saves every hour)
  if (nH != "") hourlyHistoryLogger(nH, t, h, a);

  // 3. FIREBASE SYNC (Run every 5 seconds for stability)
  if (Firebase.ready() && (millis() - lastSync > 5000)) { 
    lastSync = millis();
    
    // FETCH CONTROLS & MANUAL OVERRIDES ang Farm status
    if (Firebase.Firestore.getDocument(&fbdo_main, PROJECT_ID, DATABASE_ID, "farms/main-farm", "")) {
      FirebaseJson js; js.setJsonData(fbdo_main.payload()); FirebaseJsonData da;
      if(js.get(da, "fields/autoMode/booleanValue")) autoMode = da.boolValue;

      // Manual Feed Trigger (Always Active)
      if(!fActive && js.get(da, "fields/controls/mapValue/fields/feed/booleanValue") && da.boolValue){
        fActive = true; fTimerEnd = millis() + (fDur * 1000); 
        digitalWrite(FEED_1, HIGH); digitalWrite(FEED_2, HIGH); digitalWrite(FEED_3, HIGH);
        Serial.println("Feeding manually triggered!");
      }
      // Manual Cleaner Trigger (Always Active)
      if(!cActive && js.get(da, "fields/controls/mapValue/fields/cleaner/booleanValue") && da.boolValue){
        cActive = true; cTimerEnd = millis() + (cDur * 1000); 
        digitalWrite(STOOL_PIN, HIGH);
        Serial.println("Cleaner manually triggered!");
      }

      if(!autoMode) {
          if(js.get(da, "fields/controls/mapValue/fields/fan/booleanValue")) fanS = da.boolValue;
          if(js.get(da, "fields/controls/mapValue/fields/heater/booleanValue")) heatS = da.boolValue;
          if(js.get(da, "fields/controls/mapValue/fields/light/booleanValue")) lightS = da.boolValue;
      }
    }

    // FETCH AUTOMATION SETTINGS
    if (Firebase.Firestore.getDocument(&fbdo_settings, PROJECT_ID, DATABASE_ID, "farms/main-farm/settings/automation", "")) {
      FirebaseJson js; js.setJsonData(fbdo_settings.payload()); FirebaseJsonData da;
      if(js.get(da, "fields/feedSchedule/mapValue/fields/time/stringValue")) fTime = da.stringValue;
      if(js.get(da, "fields/feedSchedule/mapValue/fields/duration/integerValue")) fDur = da.intValue;
      if(js.get(da, "fields/cleanerSchedule/mapValue/fields/time/stringValue")) cTime = da.stringValue;
      if(js.get(da, "fields/cleanerSchedule/mapValue/fields/duration/integerValue")) cDur = da.intValue;
      if(js.get(da, "fields/lightSchedule/mapValue/fields/start/stringValue")) lStart = da.stringValue;
      if(js.get(da, "fields/lightSchedule/mapValue/fields/end/stringValue")) lEnd = da.stringValue;
    }

    // AUTO LOGIC
    if (autoMode && nT != "") {
      lightS = isInTimeRange(nT, lStart, lEnd);
      // Auto Feed
      if (nT == fTime && !fActive && nT != lastFeedTrigger) {
        fActive = true; fTimerEnd = millis() + (fDur * 1000); lastFeedTrigger = nT;
        digitalWrite(FEED_1, HIGH); digitalWrite(FEED_2, HIGH); digitalWrite(FEED_3, HIGH);
        FirebaseJson trigger; trigger.set("fields/controls/mapValue/fields/feed/booleanValue", true);
        Firebase.Firestore.patchDocument(&fbdo_main, PROJECT_ID, DATABASE_ID, "farms/main-farm", trigger.raw(), "controls.feed");
      }
      // Auto Clean
      if (nT == cTime && !cActive && nT != lastCleanTrigger) {
        cActive = true; cTimerEnd = millis() + (cDur * 1000); lastCleanTrigger = nT;
        digitalWrite(STOOL_PIN, HIGH);
        FirebaseJson trigger; trigger.set("fields/controls/mapValue/fields/cleaner/booleanValue", true);
        Firebase.Firestore.patchDocument(&fbdo_main, PROJECT_ID, DATABASE_ID, "farms/main-farm", trigger.raw(), "controls.cleaner");
      }
      // Env Controls
      if (t > 0.1) {
        if (t > 27.5) fanS = true; else if (t < 25.5) fanS = false;
        if (t < 21.0) heatS = true; else if (t > 23.5) heatS = false;
      }
    }

    // UPLOAD STATUS & SENSORS
    FirebaseJson s;
    s.set("fields/temperature/doubleValue", (double)t); 
    s.set("fields/humidity/doubleValue", (double)h);
    s.set("fields/ammonia/doubleValue", (double)a);
    s.set("fields/feedLevel/integerValue", calculateSteppedLevel(d1, 15.0)); 
    s.set("fields/feedLevel2/integerValue", calculateSteppedLevel(d2, 15.0)); 
    s.set("fields/feedLevel3/integerValue", calculateSteppedLevel(d3, 15.0));
    s.set("fields/controls/mapValue/fields/fan/booleanValue", fanS);
    s.set("fields/controls/mapValue/fields/heater/booleanValue", heatS);
    s.set("fields/controls/mapValue/fields/light/booleanValue", lightS);

    if(getLocalTime(&ti)){
      char iso[40]; strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%S+08:00", &ti);
      s.set("fields/lastUpdate/stringValue", String(iso));
    }
    
    String updateFields = "temperature,humidity,ammonia,feedLevel,feedLevel2,feedLevel3,lastUpdate,controls.fan,controls.heater,controls.light";
    if (Firebase.Firestore.patchDocument(&fbdo_main, PROJECT_ID, DATABASE_ID, "farms/main-farm", s.raw(), updateFields)) {
      Serial.println(">>> Dashboard Sync OK (" + nT + ")");
    } else {
      Serial.print(">>> Dashboard Sync ERROR: ");
      Serial.println(fbdo_main.errorReason());
    }
  }

  // PHYSICAL PINS CONTROL
  digitalWrite(FAN_PIN, fanS); digitalWrite(LIGHT_PIN, lightS);
  digitalWrite(HEATER_1, heatS); digitalWrite(HEATER_2, heatS);

  // LOGIC RESET FOR MANUAL TOGGLES
  if (fActive && millis() > fTimerEnd) { 
    fActive = false; digitalWrite(FEED_1, 0); digitalWrite(FEED_2, 0); digitalWrite(FEED_3, 0); 
    FirebaseJson r; r.set("fields/controls/mapValue/fields/feed/booleanValue", false);
    Firebase.Firestore.patchDocument(&fbdo_main, PROJECT_ID, DATABASE_ID, "farms/main-farm", r.raw(), "controls.feed");
    Serial.println("Feeding Finished");
  }
  if (cActive && millis() > cTimerEnd) { 
    cActive = false; digitalWrite(STOOL_PIN, 0); 
    FirebaseJson r; r.set("fields/controls/mapValue/fields/cleaner/booleanValue", false);
    Firebase.Firestore.patchDocument(&fbdo_main, PROJECT_ID, DATABASE_ID, "farms/main-farm", r.raw(), "controls.cleaner");
    Serial.println("Cleaning Finished");
  }
}
