# Module 11 · Command center HUD

The protected workspace keeps the original navy and cyan identity, custom CSS rings and tactical grid. Lucide supplies small navigation icons. Recharts renders assessed-category radar, clearance bars, performance lines and outcome donuts. The radar requires at least three assessed axes and falls back to a horizontal bar chart for smaller samples. All plots provide expandable textual values and avoid drawing unknown rates.

The readiness core binds a CSS progress arc to the computed value and pairs it with coverage and the number of contributing rounds. Interview details use expandable round entries with status text and color. Loading skeletons and status messages reflect actual network and operation state.

I.R.I.S. chooses a factual dashboard response from current counts, recent outcomes or recurring reported topics. Suggested actions use scripted guidance and real routes. Confirmed saves and failures use live text. The browser voice remains off until explicitly enabled and requires a separate Read response action. Cancel, closing the panel and unmounting stop speech. No microphone access, external voice service or Gemini integration is used.

Animation uses short CSS transitions and reduced-motion rules. Recharts receives responsive bounds and its per-render animation is disabled. Routes lazy-load pages and charts, and Vite splits the Supabase SDK separately. Compared with hand-written SVG charts, Recharts supplies axes, keyboard chart interaction, tooltips and sizing. The original rings and grid remain CSS/SVG for direct visual control. [Recharts responsive sizing](https://recharts.github.io/en-US/api/ResponsiveContainer/)

## Technical interview questions and answers

### 1. Why use React components for the HUD?

Panels and charts share predictable markup and take real data through props.

### 2. What is SVG used for here?

It provides scalable icons and lightweight interface details without raster assets.

### 3. Why choose Recharts?

It provides responsive React chart primitives, axes, tooltips and interaction.

### 4. When does the radar fall back to bars?

When fewer than three categories have an attempted round.

### 5. Why omit unassessed radar axes?

An absent observation should not be drawn as zero capability.

### 6. How does the donut differ from selection rate?

Each slice is a share of all interviews, while selection rate only uses completed decisions.

### 7. How do chart tooltips improve interpretation?

They show the rate alongside observed sample sizes.

### 8. How can a screen-reader user inspect a chart?

An expandable text list gives each value and sample size.

### 9. Why disable chart animations?

It reduces movement and rendering work when date filters change.

### 10. What does prefers-reduced-motion do?

It lets CSS disable decorative animation based on the user's preference.

### 11. Why pair color with status text?

The meaning remains perceivable without distinguishing the colors.

### 12. What makes an accessible delete dialog?

It has a name, managed focus, an explicit confirmation action and keyboard dismissal when idle.

### 13. What triggers an I.R.I.S. response?

Saved data or application events select a deterministic message.

### 14. Trap. Is I.R.I.S. an LLM chatbot?

Its responses are scripted. Gemini integration is a future module.

### 15. How does SpeechSynthesis work?

The browser reads an utterance using a voice it provides.

### 16. How is playback consent handled?

Voice starts off, and the user enables it then requests playback explicitly.

### 17. How do you prevent overlapping speech?

The component cancels its current utterance before another can start.

### 18. What happens when a user signs out during audio?

The protected assistant unmounts and cancels active speech.

### 19. Why lazy-load charts?

Public and non-chart routes avoid loading the chart implementation for their first render.

### 20. Can a navigation icon carry meaning alone?

The icons are decorative. The visible route labels provide the name and purpose.
