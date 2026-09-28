# Gun Game

A fast-paced neon shooting range game built with vanilla HTML, CSS, and JavaScript. The player aims with the mouse, fires at moving targets, climbs through a weapon ladder, and builds combo streaks to maximize score.

## Overview

Gun Game is a browser-based arcade challenge where every hit advances your loadout and every miss can break your combo. The game uses a single canvas rendering approach, responsive HUD elements, audio feedback, and a progression system inspired by classic gun-game mechanics.

## Features

- Mouse-based aiming and click-to-shoot mechanics
- Progressive weapon ladder: pistol → dual pistols → SMG → shotgun → rifle → sniper → LMG → gold gun → knife
- Combo multiplier system for streak-based scoring
- Animated tracer shots, muzzle flashes, recoil, and projectile effects
- Responsive UI with score, accuracy, ammo, and level tracking
- Sound toggle and keyboard accessibility controls
- No external build tools or dependencies required

## Tech Stack

- HTML
- CSS
- JavaScript
- Canvas 2D rendering

## Project Structure

```text
GunGame/
├── index.html
├── record.html
├── style.css
├── script.js
├── README.md
└── .gitignore
```

## How to Run

### Option 1: Open directly in the browser

1. Clone the repository:

```bash
git clone https://github.com/MayanKiz/GunGame.git
cd GunGame
```

2. Open `index.html` in your browser.

### Option 2: Run a local web server

If you want a cleaner local setup, serve the project folder from a static web server:

```bash
cd GunGame
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Controls

- Move mouse to aim
- Left click or Space to fire
- R to reload
- Arrow keys to nudge the aiming reticle
- Mute button in the top corner to toggle sound

## Gameplay

The goal is to eliminate targets, maintain your combo streak, and clear the full weapon ladder. As your accuracy and streak improve, your score climbs faster.

The game includes a win state once you finish the final weapon progression and a reset cycle for replayability.

## Notes

This project is intentionally lightweight and runs in the browser without a package manager or build step. It is suitable for quick prototyping, local game demos, and further expansion into additional game modes or polish.

## License

This project does not currently include a formal license file. If you plan to distribute or reuse it publicly, you may want to add an appropriate open-source license.

## Contact

For questions, collaboration, or project discussions:

- Instagram: [@rao.mynkk](https://www.instagram.com/rao.mynkk/)
- Email: [rao.mynkk@gmail.com](mailto:rao.mynkk@gmail.com)
- WhatsApp: [+24106603434](https://wa.me/24106603434)
- LinkedIn: [Mayank Yadav](https://www.linkedin.com/in/mayank-yadav-2803202a5)
