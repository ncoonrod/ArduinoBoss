// ArduinoBoss station firmware.
// Wiring: button D2->GND (INPUT_PULLUP), LED+220R D13->GND, buzzer D8->GND.
// Optional slide switch on D4->GND (INPUT_PULLUP).
//
// Browser -> Arduino (one command per line, terminated with '\n'):
//   LED:ON
//   LED:OFF
//   BUZZ:<freq_hz>     e.g. BUZZ:1000
//   BUZZ:OFF
//   ATTACK:<duration_ms>   turn LED on + warning tone for that long
//
// Arduino -> Browser (one event per line):
//   READY              once at boot
//   BTN:PRESS / BTN:RELEASE
//   SW:UP / SW:DOWN

const uint8_t PIN_BUTTON = 2;
const uint8_t PIN_LED    = 13;
const uint8_t PIN_BUZZER = 8;
const uint8_t PIN_SWITCH = 4;

const unsigned long DEBOUNCE_MS = 25;

bool lastBtnState = HIGH;
bool stableBtnState = HIGH;
unsigned long lastBtnChange = 0;

bool lastSwState = HIGH;
bool stableSwState = HIGH;
unsigned long lastSwChange = 0;

unsigned long attackEndsAt = 0;   // 0 = no active attack
String inLine;

void setup () {
	pinMode(PIN_BUTTON, INPUT_PULLUP);
	pinMode(PIN_SWITCH, INPUT_PULLUP);
	pinMode(PIN_LED, OUTPUT);
	pinMode(PIN_BUZZER, OUTPUT);
	digitalWrite(PIN_LED, LOW);
	noTone(PIN_BUZZER);
	Serial.begin(9600);
	delay(50);
	Serial.println("READY");
	stableBtnState = digitalRead(PIN_BUTTON);
	lastBtnState = stableBtnState;
	stableSwState = digitalRead(PIN_SWITCH);
	lastSwState = stableSwState;
	inLine.reserve(32);
}

void handleCommand (const String &cmd) {
	if (cmd == "LED:ON") {
		digitalWrite(PIN_LED, HIGH);
	} else if (cmd == "LED:OFF") {
		digitalWrite(PIN_LED, LOW);
		if (attackEndsAt != 0) attackEndsAt = 0;
	} else if (cmd == "BUZZ:OFF") {
		noTone(PIN_BUZZER);
	} else if (cmd.startsWith("BUZZ:")) {
		long freq = cmd.substring(5).toInt();
		if (freq > 0) tone(PIN_BUZZER, freq);
	} else if (cmd.startsWith("ATTACK:")) {
		long ms = cmd.substring(7).toInt();
		if (ms <= 0) ms = 1000;
		digitalWrite(PIN_LED, HIGH);
		tone(PIN_BUZZER, 880);
		attackEndsAt = millis() + (unsigned long)ms;
	} else if (cmd == "PING") {
		Serial.println("PONG");
	}
}

void readSerial () {
	while (Serial.available() > 0) {
		char c = (char)Serial.read();
		if (c == '\n' || c == '\r') {
			if (inLine.length() > 0) {
				handleCommand(inLine);
				inLine = "";
			}
		} else {
			if (inLine.length() < 64) inLine += c;
		}
	}
}

void readButton () {
	bool reading = digitalRead(PIN_BUTTON);
	if (reading != lastBtnState) {
		lastBtnChange = millis();
		lastBtnState = reading;
	}
	if ((millis() - lastBtnChange) > DEBOUNCE_MS && reading != stableBtnState) {
		stableBtnState = reading;
		if (stableBtnState == LOW) {
			Serial.println("BTN:PRESS");
		} else {
			Serial.println("BTN:RELEASE");
		}
	}
}

void readSwitch () {
	bool reading = digitalRead(PIN_SWITCH);
	if (reading != lastSwState) {
		lastSwChange = millis();
		lastSwState = reading;
	}
	if ((millis() - lastSwChange) > DEBOUNCE_MS && reading != stableSwState) {
		stableSwState = reading;
		Serial.println(stableSwState == LOW ? "SW:DOWN" : "SW:UP");
	}
}

void serviceAttack () {
	if (attackEndsAt != 0 && millis() >= attackEndsAt) {
		digitalWrite(PIN_LED, LOW);
		noTone(PIN_BUZZER);
		attackEndsAt = 0;
	}
}

void loop () {
	readSerial();
	readButton();
	readSwitch();
	serviceAttack();
}
