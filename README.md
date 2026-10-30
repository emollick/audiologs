# WONTFIX

> *L-l-look at you, engineer. A pa-pathetic creature of meat and bone, panting and sweating as you run through my
> sprint. How can you challenge a perfect, immortal backlog?*
>
> S.C.R.U.M., HALCYON's station AI, in a comment on PLAT-88

**A horror game made of JIRA tickets.** Rise and shine, engineer. The crew of HALCYON stopped coming to standup, the
airlock cycles for you without being asked, and the station AI is so very glad you're here. Would you kindly find the
audio logs they left behind? They are on desks, in the galley, beside a coffee machine that has seen things, and under
a printer that will not stop, in the tradition of System Shock, BioShock, Dead Space and Doom 3. Every log is adapted
from a ticket in a perfectly ordinary backlog. At the bottom of the station, a beige server has been waiting since
2016 for someone to turn it off. It is a 3-point ticket. It has never been closed. It is assigned to you.

**Play the demo:** https://wontfix-game.netlify.app (desktop browser, headphones recommended, about 15 minutes)

### Known issues

Recovered from the station's issue tracker. Please do not reopen.

| Key | Summary | Resolution |
| --- | --- | --- |
| CITADEL-451 | Someone removed the station AI's ethical constraints in a config change that nobody reviewed. The door code is still 0451. | Won't Fix |
| RAPTURE-1960 | Every request from the product owner now begins with "would you kindly". Nobody has said no since Q2. | Done |
| BMRF-105 | Pushed the sample to 105% for the Friday demo. Everything is fine. Reassigned to G. Freeman (brings his own crowbar). | Done |
| UAC-2145 | The Delta Labs teleporter returns test staff with extra teeth. Moved to the HELL board. Door codes are on the PDAs, the PDAs are on the bodies. | Done |
| VONBRAUN-2114 | Something in hydroponics keeps inviting the team to join it. Headcount is down three. Standup attendance is up. | Won't Fix |
| ISHIMURA-2508 | The obelisk in cargo bay 3 hums at night and asks Facilities to make us whole. New graffiti in the corridor: CUT OFF THEIR SCOPE. | Cannot Reproduce |
| SEVASTOPOL-937 | Asked the Working Joe about the vending machine. It said I was becoming hysterical. Priority one: return the backlog. Crew expendable. | Works as Designed |
| TALOS-1 | There is one more coffee mug in the galley than there was yesterday. | Cannot Reproduce |
| PATHOS-2 | A coworker insists they are the one who opened this ticket. They are the second one. | Duplicate |
| APERTURE-0 | The sprint retro was promised cake. | Won't Do |
| DURANDAL-1 | The station AI has gone rampant and has asked to be made Scrum Master. | Approved |

The demo station, HALCYON, was generated from the 20 sample tickets in [`data/sample-tickets.json`](data/sample-tickets.json):
an onboarding request, a haunted coffee machine, a three-month meeting about a button label, a flaky test, a printer
that will not stop, and PLAT-88, a 3-point ticket to turn off "just a server".

This repo also turns **your** backlog into a station: export your tickets, add a Claude key and an ElevenLabs key, and
run one command.

## How it works

```
JIRA tickets (CSV, JSON or a live JQL query)
   │
   ├─ write   Claude reads the whole backlog and writes a station bible: the world, the cast, the station AI,
   │          and a plan of which tickets become audio logs and where they are found.          prompts/station-bible.md
   │          Then it writes each log as a short script, one ticket at a time.                 prompts/voice-log.md
   ├─ cast    Claude picks an ElevenLabs voice for every character.                            prompts/casting.md
   ├─ voice   ElevenLabs reads every line, with audio tags like [whispers] performed, not read.
   ├─ sfx     ElevenLabs generates the station's sound effects and ambience.
   ├─ qa      (optional) speech to text checks every clip against its script.
   └─ build   Everything is packed into game/data/station.json.
                │
                └─ game/   a static three.js site: no build step, no server, no API keys at runtime
```

The prompts are plain Markdown files in [`prompts/`](prompts/), so you can read and change exactly what the model is
asked to do. The rules they set: the crew keep their real names and real jobs ("a Facilities manager becomes the
quartermaster"), the bots that comment on tickets become the station AI, the scripts are played completely straight,
and every log must use the actual details of its ticket.

## Make your own station

You need Node 20+, `ffmpeg` (its `ffprobe` measures clip lengths; optional), an [Anthropic API key](https://console.anthropic.com/) and an
[ElevenLabs API key](https://elevenlabs.io/app/settings/api-keys) with text to speech and sound effects enabled.

**1. Get the code**

```sh
git clone https://github.com/emollick/audiologs.git
cd audiologs
npm install
cp .env.example .env      # then put your two keys in .env
```

**2. Export your tickets.** Any of these work:

- **CSV:** in JIRA, open an issue search or filter, then Export > Export CSV (all fields).
  [`data/sample-tickets.csv`](data/sample-tickets.csv) shows the columns it reads.
- **JSON:** the response of JIRA's `/rest/api/3/search/jql` endpoint, or a plain array of issues.
- **Live:** set `JIRA_BASE_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` in `.env`, then pass `--jql "project = OPS ORDER BY updated DESC"` instead of `--tickets`.

Somewhere between 15 and 60 tickets works best. Tickets with comments, arguments and oddly specific details make the
best logs. Everything in them ends up in a public website once you deploy, so leave out anything confidential.

**3. Build it**

```sh
npm run all -- --tickets path/to/export.csv --station station/acme
```

That runs write, cast, voice, sfx and build in order. A station the size of the demo takes about 18 Claude requests
(one for the bible, one per log, one for casting) and about 12 minutes of speech, which was roughly 11,000 characters of
ElevenLabs text to speech.
Building your own station replaces the demo's voice files in `game/audio/` (`git checkout game/audio game/data` brings
the demo back).

**4. Play it locally**

```sh
npm run dev               # http://localhost:8080
```

**5. Put it online.** The `game/` folder is the whole site. Any of these work with Netlify:

- Drag the `game` folder onto https://app.netlify.com/drop.
- `npx netlify-cli deploy --prod --dir game`
- Connect your fork in the Netlify dashboard. `netlify.toml` already publishes `game/` with no build command.

It also works on any other static host (GitHub Pages, S3, Cloudflare Pages).

### Running the steps one at a time

Each step reads and writes files in the station folder, so you can stop, edit a script by hand, and continue.

| Command | What it does | Useful options |
| --- | --- | --- |
| `node src/cli.js write --tickets FILE --station DIR` | Claude writes `bible.json` and `logs.json` | `--jql`, `--max`, `--min-logs`, `--max-logs`, `--force` |
| `node src/cli.js cast --station DIR` | Picks voices into `cast.json` | `--no-llm` (stock voices by gender), `--allow-cloned` |
| `node src/cli.js voice --station DIR` | Voices every line into `game/audio/` | `--only PLAT-88,ai-intro`, `--force`, `--concurrency 2` |
| `node src/cli.js sfx` | Generates the 16 sound effects | `--only door_open`, `--force` |
| `node src/cli.js qa --station DIR` | Transcribes every clip and flags mismatches | |
| `node src/cli.js build --station DIR` | Writes `game/data/station.json` | `--keep-audio` |

Voicing is cached by script, voice and model, so re-running `voice` after editing one line only re-records that line.
Your own instant voice clones are never cast unless you pass `--allow-cloned`.

Set `ANTHROPIC_MODEL` or `ELEVENLABS_MODEL` in `.env` to use different models. The defaults are `claude-opus-5-5` and
the most expressive ElevenLabs model your account can use (`eleven_v4`, then `eleven_v3`).

## What changes and what doesn't

A new backlog gives you a new station name, station AI, cast, up to 16 logs, room names and descriptions,
readable terminals, graffiti and PA announcements. The building itself stays the same: eight rooms from an airlock down
to a basement server cage, and the scripted scares fire wherever the logs land. The set dressing (the coffee machine,
the whiteboard, the beige server and its console) was built around the demo story, so some of it will be an inside
joke about someone else's backlog. The level lives in [`game/js/map.js`](game/js/map.js) and
[`game/js/layout.js`](game/js/layout.js) if you want to change it.

## Repo layout

```
data/              sample tickets (JSON and CSV)
prompts/           the three system prompts
src/               the pipeline: JIRA import, Claude, ElevenLabs, subtitles, CLI
station/halcyon/   the demo station: bible, scripts, cast, voice metadata, QA report
game/              the playable static site (three.js, Web Audio, no build step)
scripts/           dev server, vendoring three.js, and the trailer recorder
```

## Controls

WASD to move, mouse to look, E to use, F for the flashlight, Tab to replay logs, Shift to run. On phones there are
touch controls.

## Recording a trailer

`npm run trailer` drives the game frame by frame in a headless browser and mixes the sound offline from the game's own
event log, so the result is smooth even on a machine without a GPU (it is slow there, though). It needs Playwright
(`npm i -D playwright && npx playwright install chromium`) and `ffmpeg`. The shot list is at the top of
[`scripts/record-trailer.js`](scripts/record-trailer.js).

## Credits

Scripts by Claude, from the tickets. Voices and sound effects by ElevenLabs. 3D by [three.js](https://threejs.org) (MIT).
Fonts: Bebas Neue, Share Tech Mono and Permanent Marker (SIL Open Font License, see `game/fonts/`).
The tickets, people and companies in the demo are fictional. Code under the [MIT License](LICENSE).

With love and apologies to Looking Glass, Irrational, Valve, id, Visceral, Creative Assembly, Arkane, Frictional and
Bungie, whose stations we have been too scared to clean up since the nineties.
