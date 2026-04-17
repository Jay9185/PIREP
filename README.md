# PIREP

# North Sector PIREP Bot
### Temporal-Decay Weighted Crowdsourced Intelligence for Cadet Pilots

The North Sector PIREP Bot is a serverless, high-utility tool designed to solve the "information lag" in general aviation training environments. While official ATIS and PIREPs provide critical data, they often fail to capture the high-frequency shifts of the Sonoran Desert's thermal cycles.

This bot allows a community of pilots to log subjective conditions in seconds, which are then processed through a temporal-decay algorithm to provide a real-time, peer-reviewed status board of the practice areas.

---

## 🌪️ The Core Problem: The Friction of PIREPs

Standard PIREPs (Pilot Weather Reports) are essential but suffer from high friction. Reporting via Radio (ATC) or Flight Service takes significant mental bandwidth during high-workload phases of flight. Consequently, reports are infrequent, and the data is often "stale" by the time a student enters the practice area.

**The Solution:** A Calm interface via Telegram that reduces a complex meteorological observation to three taps, processed at the edge with zero latency.

---

## 🚀 Key Features

### 1. The Dynamic Status Board (`/status`)
A live dashboard showing the status of the SATR, Local Patterns, and Anthem sectors. Instead of a simple average, the board uses a weighted scoring system that prioritizes recent data over historical logs.

### 2. Calibrated 1–5 Reporting (`/landed`)
To prevent "Subjective Drift," all reports are mapped to a strict Standard Operating Procedure (SOP):

- **Turbulence:** Calibrated from 1 (Glassy) to 5 (Unsafe/RTB Required) based on airspeed fluctuations and control workload.
- **Winds:** Calibrated from 1 (Calm) to 5 (Hazardous) based on personal and solo crosswind minimums.

### 3. Shift Detection (Automated Intelligence)
A background process monitors the rate of change in the North Sector. If the average turbulence score jumps significantly (e.g., +1.0) within a 30-minute window, the bot autonomously blasts a 🚨 ** SHIFT** alert to the group to warn incoming blocks of rapidly degrading conditions.

### 4. Anomaly & Troll Filtering
The system compares new entries against a 2-hour rolling peer average. If a report deviates by more than 2.5 points from the current consensus, it is automatically flagged and its weight is reduced to `0.2`, preventing a single outlier from "poisoning" the dashboard.

---

## 🧮 The Mathematics of Freshness

The heart of the bot is the **Exponential Time-Decay Function**. Weather is a high-entropy variable; a report from 10 minutes ago is significantly more valuable than one from 2 hours ago.

### The Decay Formula

Each report is assigned a weight `W` based on its age `t` in minutes:

```
W = e^(-λt)
```

| Variable | Description |
|---|---|
| `e` | Euler's number |
| `t` | Minutes elapsed since the observation |
| `λ` (Lambda) | Decay constant — shifts dynamically based on the Phoenix sun cycle |

**Dynamic Lambda Values:**

| Condition | λ | Half-Life | Rationale |
|---|---|---|---|
| Midday (11am–4pm) | `0.02` | ~35 min | High decay as thermals peak |
| Morning / Night | `0.005` | ~140 min | Low decay for stable laminar air |
| Default | `0.01` | ~70 min | Standard transition periods |

### Weighted Average Calculation

The final score displayed on the dashboard:

```
Final Score = Σ(Scoreᵢ × Wᵢ) / ΣWᵢ
```

This ensures the live status is always an accurate reflection of the current atmospheric state.

---

## 🛠️ Tech Stack & Architecture

> Developed with a 100% iPad Pro-native workflow, utilizing Cloudflare's serverless ecosystem for maximum uptime and zero maintenance.

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (JavaScript / V8 Engine) |
| Database | Cloudflare D1 (SQL-based Edge Database) |
| Messaging | Telegram Bot API (Webhooks) |
| Scheduling | Cloudflare Cron Triggers (Vibe Shift monitoring) |

---

## 📖 Standard Operating Procedures

### 🌪️ Turbulence Scale

| Rating | Label | Description |
|---|---|---|
| 1 | **Glassy** | Zero movement. Trim-only flight. |
| 2 | **Light** | Occasional rhythmic bumps. Standard AZ heating. |
| 3 | **Moderate** | Constant corrections required to maintain altitude. |
| 4 | **Heavy** | Airspeed fluctuations ±10 knots. Loose items shift. |
| 5 | **Unsafe** | Momentary loss of control. RTB Suggested. |

### 💨 Winds / Gusts Scale

| Rating | Label | Description |
|---|---|---|
| 1 | **Calm** | <5 knots. No crab required. |
| 2 | **Within Mins** | Noticeable wind, well within solo minimums. |
| 3 | **At Mins** | At personal/solo crosswind minimums. High focus required. |
| 4 | **Exceeding Mins** | Exceeding standard training minimums. Go-around likely. |
| 5 | **Hazardous** | Approaching control limits. Divert Recommended. |
