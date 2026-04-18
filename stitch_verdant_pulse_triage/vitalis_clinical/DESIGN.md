# Design System Specification: The Clinical Sanctuary

## 1. Overview & Creative North Star
**Creative North Star: The Clinical Sanctuary**

In the healthcare space, the "standard" often fluctuates between overly sterile utility and cluttered data density. This design system rejects both. Our goal is to create a "Clinical Sanctuary"—an editorial-inspired digital environment that balances the authority of a world-class medical institution with the soothing clarity of a premium wellness retreat.

We move beyond the "template" look by utilizing **intentional asymmetry** and **tonal depth**. Instead of boxing content in, we allow it to breathe. We utilize high-contrast typography scales and generous white space to guide the eye, ensuring that the most critical health data is never obscured by visual noise. This system is bright, structured, and profoundly calm.

---

## 2. Colors & The Tonal Architecture
The palette is rooted in deep, authoritative blues (`primary`) and empathetic, soft teals (`secondary`). The goal is to move away from "flat" design and toward a tactile, layered experience.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts. To separate a navigation rail or a sidebar from the main content, use `surface-container-low` (#f1f4f9) against the main `surface` (#f7f9fe). Lines create visual "stutter"; color transitions create flow.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the `surface-container` tiers to create "nested" importance:
- **Base Layer:** `surface` (#f7f9fe)
- **Secondary Content Areas:** `surface-container-low` (#f1f4f9)
- **Active Interactive Cards:** `surface-container-lowest` (#ffffff) to make them "pop" against the off-white background.
- **Persistent Utilities:** `surface-container-high` (#e5e8ed)

### The "Glass & Gradient" Rule
To elevate the experience from "clinical" to "premium," use Glassmorphism for floating elements (like modals or dropdowns). Use the `surface` color at 80% opacity with a `backdrop-blur` of 20px. 
**Signature Texture:** For hero sections or primary Call-to-Actions, apply a subtle linear gradient from `primary` (#00376f) to `primary_container` (#004e98) at a 135-degree angle. This provides a "soul" and depth that flat hex codes cannot achieve.

---

## 3. Typography: Editorial Authority
We use a dual-font strategy to balance character with legibility.

- **Display & Headlines (Manrope):** Use Manrope for all `display` and `headline` tokens. Its geometric yet friendly curves convey modern professionalism. Use `display-lg` (3.5rem) with tight letter-spacing (-0.02em) for high-impact editorial moments.
- **Body & Labels (Inter):** Inter is our workhorse. It is engineered for screens and high legibility in medical data contexts. Use `body-md` (0.875rem) for standard UI text to maintain a sophisticated, slightly smaller-scale aesthetic that feels "boutique."

**Hierarchy Tip:** Always maintain at least a 2-step jump in the type scale between a title and its supporting body text to ensure a clear, accessible information architecture.

---

## 4. Elevation & Depth: Tonal Layering
In this design system, shadows and borders are a last resort, not a first choice.

### The Layering Principle
Depth is achieved by "stacking." Place a `surface-container-lowest` (#ffffff) card on a `surface-container-low` (#f1f4f9) section. This 2% shift in brightness creates a soft, natural lift that mimics fine stationery.

### Ambient Shadows
When an element must "float" (e.g., a critical notification), use an **Ambient Shadow**:
- **X: 0, Y: 12px, Blur: 32px**
- **Color:** `on-surface` (#181c20) at **4% to 6% opacity**. 
- This creates a soft glow rather than a harsh drop shadow, simulating natural laboratory lighting.

### The "Ghost Border" Fallback
If a container requires a boundary for accessibility (e.g., an input field), use a **Ghost Border**. Apply the `outline-variant` (#c2c6d3) at **20% opacity**. This provides enough contrast for the eye without breaking the "No-Line" rule.

---

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`), `on-primary` text, `DEFAULT` (8px) rounded corners.
- **Secondary:** `secondary_container` fill with `on-secondary-container` (#007074) text. No border.
- **Tertiary:** No fill, `primary` text. Use for low-emphasis actions.

### Cards & Lists
**Strict Rule:** Forbid the use of divider lines between list items or card sections. Use `8px` to `16px` of vertical white space to define separation. For complex lists, use alternating background tints: `surface` and `surface-container-low`.

### Input Fields
- **Background:** `surface-container-lowest` (#ffffff).
- **Border:** Ghost Border (20% `outline-variant`).
- **Focus State:** 2px solid `primary`. No "glow" effect—keep it sharp and clinical.

### Modern Healthcare Additions
- **Patient Progress Rings:** Use `secondary` (#00696d) for positive health metrics and `error` (#ba1a1a) for urgent alerts.
- **Status Pills:** Use `full` (9999px) roundedness. `primary_fixed` (#d6e3ff) background with `on-primary-fixed` (#001b3c) text for a high-contrast, premium "tag" look.

---

## 6. Do's and Don'ts

### Do:
- **Do** use generous padding (at least 24px-32px) inside containers to emphasize the "Sanctuary" feel.
- **Do** use `secondary` (Teal) to highlight "Wellness" and "Success" states.
- **Do** treat "White Space" as a design element as important as any color or icon.

### Don't:
- **Don't** use 100% black text. Use `on-surface` (#181c20) to keep the contrast high but the "vibe" soft.
- **Don't** use "Dark Mode" as a default. This system is designed for high-lumen, clinical environments where clarity and brightness are paramount.
- **Don't** use sharp 0px corners. Always use the `DEFAULT` (8px) or `md` (12px) tokens to maintain an approachable, human-centric interface.

### Accessibility Note:
While we use soft tonal shifts, ensure that all text-on-background combinations meet a minimum 4.5:1 contrast ratio. The `on-primary` and `on-secondary` tokens have been specifically selected to ensure readability against their respective containers.