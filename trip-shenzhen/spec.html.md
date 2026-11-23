# Soto Phone — Product Requirements (v0.5)

Soto Phone (working name) · For an initial ODM / design-house feasibility round, Shenzhen, November 2026 · This is not a production order · Contact: Kazuma Sasaki, Founder
Items marked TBD are not decided yet. We welcome your recommendations on every item.

**What we need first.** Please answer with evidence before giving a production quote:
- The exact square panel part number, and evidence of supply at 500 / 1,000 / 3,000 units.

- A live demo of Android running on that panel with touch working.

- A written list of what our engineers can build and sign without you.

- Which Japanese mobile plans you have tested, and what voice and eSIM functions you can demonstrate now.

## 0. Reference device

Our current reference is an existing square phone on the Chinese market, the **Coolpad 酷派 小方块** (3.95-inch square 720 × 720 display, MediaTek Helio G99, body about 78.4 × 78.4 × 8.5 mm). We want a phone built on the **same kind of board and panel**, with these changes:

- A **fixed rear camera** built into the back, instead of the flip camera.

- **Our own housing design** and material. We will not copy the reference device's exterior.

- **Our own operating system** (AOSP, no GMS) that we build and update ourselves.

Do you know which design house made this phone? Can you use the same board and panel (or an equivalent you already produce)? Reusing an existing board and panel is how we hope to start at about 500 units.

## 1. Product summary

A compact Android phone with a square screen, sold in Japan. It is designed as a second phone: people carry it when they want to step away from their main smartphone and spend time outside. It has no social media, no games and no app store. It is sold together with a monthly eSIM plan.

- Target users: adults and students in Japan who want less screen time.
- Positioning: a well-made, calm object, not a rugged or budget phone.
- Expected first order: **about 500 units** if possible (TBD). Please tell us your real minimum order, and what changes (price, parts, options) at 500 units.

## 2. Hardware

- **Display:** Square (1:1) touchscreen, about 3.9–4.0 inch, about 720 × 720 or higher. An existing production IPS panel first; AMOLED as an alternate if you can show reliable supply and an acceptable minimum order. Please give the panel part number, mechanical drawing, and what happens if it is discontinued.

- **Body size:** Start the design study at about 80 × 80 mm (a 4.0-inch square active area is about 71.8 mm per side). Final size follows the actual panel, flex cable and housing. Thickness target 8.5–10 mm; **any design above 10 mm needs our written approval.**

- **Rear camera:** One fixed camera built into the back (no flip, rotating or pop-up camera). About 13 MP, autofocus, LED flash. Camera bump 1 mm or less if possible.

- **Front camera:** Not planned. Please quote as a separately priced option.

- **Chipset:** MediaTek Helio G99 (as in the reference device) or an equivalent you already have a board for.

- **Memory:** 4 GB + 64 GB baseline; 4 GB + 128 GB option.

- **Battery:** 2,500 mAh **minimum rated** capacity. USB-C. Printed capacity label. UN38.3 test summary for the actual pack.

- **Cellular:** 4G LTE, Japanese bands B1 / B3 / B8 / B18 / B19 / B26 / B28 (B41 preferred), VoLTE.

- **Launch network:** TBD — a dependency. The launch eSIM plan and its host network are not selected yet. **For the first release, only the launch network is required** (VoLTE on all four Japanese operators is a later goal, quoted as an option). Final acceptance is tied to the plan we will actually sell.

- **SIM:** eSIM required. One nano-SIM slot as an option.

- **Wireless:** Wi-Fi 2.4/5 GHz, Bluetooth 5.x, GPS (+ QZSS/Michibiki if possible).

- **NFC:** TBD. We will define the use (tags, payments or Japanese transit cards) before you quote it.

- **Sensors:** Proximity, ambient light, accelerometer. No fingerprint at launch.

- **Buttons:** Power, volume up, volume down; position flexible.

- **Audio:** Earpiece, loudspeaker, microphone; no headphone jack. **Vibration:** linear motor preferred.

## 3. Housing, material and finish

- Our own industrial design; we provide 3D data and welcome your ID/MD input.

- Baseline quote: **matte textured polycarbonate**. Alternates: **coated (soft-touch) polycarbonate** and **anodized aluminium**. For aluminium, show an antenna layout and validation plan. For coatings, provide samples and their resistance to sunscreen, sweat and abrasion.

- Matte black first. Logo printed lightly on the back. Our own retail box.

- We would like to visit the factory that will make our housing and see production samples of each material.

## 4. Software (most important)

- **OS:** AOSP, no GMS. State the Android version at first shipment.

- **Source code:** List exactly what you deliver: source code, binary-only components, license or NDA restrictions (for example MediaTek), and which fixes depend on MediaTek or on you.

- **Keys:** We control the boot trust keys, OTA signing keys and recovery authorization. **Our engineers generate and keep the private keys.** You demonstrate how keys are provisioned without taking custody of them.

- **Development and retail configurations:** Unlockable bootloader on development units; locked on retail units. Flashing tool and procedure.

- **Updates:** An OTA system we operate ourselves. Security maintenance for 3 years from first retail shipment, with patch cadence, response times and responsibility for vendor fixes in writing.

- **Pre-installed apps:** Only our user-facing apps (launcher, phone, SMS, camera, maps, transit, settings) plus an agreed list of required system services. No other apps, no ads.

- **Notifications without GMS:** Share your experience. We do not treat microG as a guarantee; we will choose and test a method we control.

## 5. Certification and compliance

- Giteki and JATE: cost, time, certificate holder, scope, emergency-call testing, and which later hardware or software changes need reassessment.
- RoHS. UN38.3 for the battery.

## 6. First deliverable: the engineering handset

Before any custom housing or tooling, we want a working engineering handset, quoted separately (cost and lead time). State the board revision, chipset, panel and touch-controller part numbers, Android version, build and flashing requirements, and whether this exact board-and-panel combination already runs or needs integration. A bench-mounted unit is fine.

**Number of units:** please tell us whether one unit can safely switch between a development (unlocked) and a retail-like (locked) configuration. If not, quote a second unit separately.

We accept the handset when these tests pass:

- **A. Display and touch:** Android at native resolution; touch works across the full active area.

- **B. Software control:** Our engineers build a complete image on a clean machine and flash the development configuration. The locked retail-like configuration accepts an OTA update signed with our keys.

- **C. Phone service:** On the launch eSIM plan (once selected): profile download, activation, deletion and reinstall; incoming and outgoing VoLTE calls; SMS both ways; LTE data. Before any transmission in Japan we agree a lawful test setup with the carrier and a Japanese test lab. A test in China on a local network shows basic operation only and does not pass this test.

- **D. Mechanical fit:** A dimensioned cross-section using the actual panel, a named battery of at least 2,500 mAh minimum rated capacity, and the fixed rear camera, with their part numbers. Show thickness without the camera bump, maximum thickness with it, clearances, and the battery expansion allowance. Above 10 mm needs our written approval.

**No enclosure tooling will be ordered until the handset passes these tests.**

## 7. Samples and schedule

Please give dates and dependencies for each stage; payments are tied to each deliverable:

- Engineering handset (section 6)
- Appearance (ID) samples
- Working samples running our software build
- Production-like design with test results
- Pilot batch of about 100 units, with documented approval for use in Japan
- Mass production

## 8. Please quote (same format for every supplier)

- **One-time:** NRE (what it covers), ID/MD design, tooling

- **Per-unit hardware:** FOB Shenzhen, USD, at 500 / 1,000 / 3,000 units; baseline price and each option priced separately

- **Per-device licenses**
- **Yearly software support:** OTA operation and security updates

- **Certification:** Giteki, JATE
- **Engineering handset (and second unit if needed) and samples:** cost and lead time

Also: MOQ, payment terms, warranty, defect rate, and ownership and handover of moulds, PCB design files, software changes, factory flashing access and test fixtures.

## 9. Questions for you

- Is the board-and-panel combination already running? Can you show it live?
- Do you know who designed the reference device, and can you reuse its board and panel?
- How much thicker does the body become with a fixed autofocus camera inside, compared with the 8.5 mm reference?

- Which Japanese plans and operators have you tested, and with what results?

- What is the thinnest body with a fixed rear camera and a 2,500 mAh battery?

- Which parts change the price most?

- Can you arrange a visit to the factory that will make our housing?
