# MSFS 2024 on AWS: the one-evening trial

Three questions, answered in one evening on your own AWS account:

1. Does Microsoft Flight Simulator 2024 (Steam edition) install, sign in and
   run on an EC2 Windows Server GPU instance?
2. Can our agent (`tools/msfs-agent`) replay a real flight from the Studio
   with scripted cameras?
3. Can OBS record it unattended at 1440p and 4K, and how does it look?

What is here:

| File | What it is |
|---|---|
| `template.yaml` | CloudFormation: the GPU instance (Windows Server 2025, 250 GB gp3), its security group (DCV from your address only), its role (SSM, the bucket, the driver's and DCV's AWS buckets), the bucket for recordings and logs (deleted after 14 days), the idle stop, the role for the timed stop, and a $50 budget that stops the instance |
| `trial.sh` | Everything from the Mac: `up`, `status`, `dcv`, `run`, `fetch`, `down`, `destroy` |
| `run-replay.ps1` | What `trial.sh run` has SSM Run Command do on the instance |
| `../../tools/msfs-agent` | The replay agent (.NET, SimConnect, obs-websocket), its tests, and the trial's track |

The first boot installs, with no one there: the NVIDIA gaming driver (from
AWS's `nvidia-gaming` bucket, free on EC2), Amazon DCV (free on EC2: no
licence server, the instance reads its licence from AWS's `dcv-license`
bucket), OBS Studio 33.0.1, Steam and the .NET 11 SDK; then it sets
Windows to sign Administrator in by itself, and restarts. Each was checked
against its maker's documentation on 2026-11-12 (sources below).

## How it stops spending

- **Idle:** under 3% CPU for 45 minutes, CloudWatch stops the instance.
- **Time:** `trial.sh up` schedules a stop 4 hours on (`--hours`), and
  Windows shuts itself down 6 hours after every boot whatever happens.
- **Budget:** at $50 actual spend in the month, AWS Budgets stops the
  instance, and it emails you at 50% spent and at a forecast of 100%.
  Budgets reads costs up to three times a day, so it can act hours late:
  the idle and time stops are what keep an evening an evening.
- **`trial.sh destroy`** deletes everything: instance, disk, bucket and
  recordings, budget, roles, passwords. Nothing of the trial is billed after.

A stopped instance still pays for its disk, about $1.70 a day (250 GB gp3
with 6,000 IOPS and 500 MB/s, for a fast install), so `destroy` when done.

## The steps

Prices are us-east-1's on-demand Windows prices from AWS's price list of
2026-11-10: **g6e.2xlarge (NVIDIA L40S, 8 vCPUs, 64 GB) $2.61 an hour**;
g6.2xlarge (NVIDIA L4, 8 vCPUs, 32 GB) $1.35 an hour, `--type g6.2xlarge`,
cheaper and the more likely to match what a production renderer would use.

| # | Step | Time | Cost |
|---|---|---|---|
| 1 | AWS account and CLI profile | 15 min (a new account can take hours to activate) | $0 |
| 2 | GPU quota request | 5 min to send; minutes to 2 business days to grant | $0 |
| 3 | Buy MSFS 2024 on Steam | 5 min | $69.99 (refundable, see below) |
| 4 | `trial.sh up` | 5 min, then 20 to 25 min of setup on its own | about $1 |
| 5 | DCV: sign in, install MSFS 2024 and the SDK, set up OBS | 60 to 90 min | $3 to $4 |
| 6 | `trial.sh run` at 4K and 1440p | about 50 min (two 19-minute flights in real time, plus builds and loading) | about $2.20 |
| 7 | `trial.sh down`, `fetch`, review | 20 min | under $1 (10 to 15 GB out; AWS's first 100 GB out a month are free) |
| 8 | `trial.sh destroy` | 5 min | $0 from then |
| | **The evening** | **about 3 to 3.5 hours of instance time** | **about $8 to $12 on AWS**, plus the game |

### 1. The AWS account and a CLI profile

1. Sign up at aws.amazon.com (a card and a phone), or use the account you
   have. Turn on MFA for the root user and make an IAM Identity Center user
   with AdministratorAccess for yourself; don't use root.
2. On the Mac: `brew install awscli`, then `aws configure sso` (profile
   name `wingtip-trial`, region `us-east-1`), then
   `export AWS_PROFILE=wingtip-trial AWS_REGION=us-east-1`.
3. Check: `aws sts get-caller-identity` prints your account.

### 2. The GPU quota

New accounts can run no G instances: the quota is 0 vCPUs. In the console,
**Service Quotas > AWS services > Amazon Elastic Compute Cloud (Amazon EC2) >
Running On-Demand G and VT instances** (quota code `L-DB2E81BA`), in
**us-east-1**, **Request increase at account level**, new value **8**
(16 to try a g6e.4xlarge later). The quota is in vCPUs, not instances, and
the Spot quota ("All G and VT Spot Instance Requests") is a different one.
If AWS asks for a use case (it often does on a new account, as a support
case), write:

> One g6e.2xlarge (or g6.2xlarge) Windows instance for a few hours of
> testing: a flight simulator rendering and video encoding (NVENC) trial
> for a flight-planning app. Interactive through Amazon DCV, stopped when
> idle, with an AWS Budgets limit. On-demand only, us-east-1.

`trial.sh up` checks the quota before it starts anything.

### 3. MSFS 2024 on Steam, and the refund rule

Buy **Microsoft Flight Simulator 2024 (Standard, $69.99 on Steam)** on your
Steam account, from the Mac or the phone, before the evening. Steam
refunds a game **within 14 days of purchase with less than 2 hours of
playtime** (store.steampowered.com/steam_refunds). Playtime is every
minute the game is running, the agent's replays included: the first
launch, sign-in and two runs come to about 1.5 to 2 hours. If the trial
says no early, quit the game and ask for the refund the same day.

### 4. `trial.sh up`

```
infra/sim-trial/trial.sh up --email you@example.com
```

It checks the quota, finds the default VPC and a zone that has the
instance type, reads your address (DCV answers only it), deploys the stack,
schedules the stop, and prints the state. The first boot then takes 20 to
25 minutes; `trial.sh status` shows the setup log's last lines, which end
with `set up; restarting for the driver`. If the driver step says it found
no build for this Windows, `trial.sh destroy` and `up --windows 2022`.

### 5. The one sitting at the desktop (DCV)

`trial.sh dcv` prints the address and the passwords. Install the DCV
client (download.amazondcv.com, "DCV Viewer" for macOS) or use the browser,
and connect as Administrator. Then, timing each:

1. Check the driver: `nvidia-smi -q` in PowerShell (it is under
   `C:\Windows\System32\DriverStore\FileRepository\...`) shows
   `License Status : Licensed`.
2. **Steam:** sign in, install Microsoft Flight Simulator 2024 to the C:
   drive. Steam says 50 GB; note the size and the time it takes.
3. **MSFS 2024:** start it once, sign in to your Microsoft (Xbox) account
   when asked, let it finish its first download, set the graphics to
   3840x2160 full screen, and in Options turn off crash detection (the
   agent places the airplane by hand). Start a **free flight at Sedona
   (KSEZ)** in a Cessna 172 or, if the edition has one, a PA-28, on the
   runway with the engine running. Note the times of each.
4. **The SDK:** in the game, Options > General > Developers > Developer
   Mode on, then Help > SDK Installer (or docs.flightsimulator.com's
   download page); install the Core SDK. It sets `MSFS2024_SDK`, which
   the build reads.
5. **OBS:** start it from the desktop shortcut and finish the first-run
   wizard ("optimise for recording"). Tools > WebSocket Server Settings:
   enable, port 4455, authentication on, the password `trial.sh dcv`
   printed. Settings > Output > Output mode **Advanced** > Recording:
   type Standard, format **Hybrid MP4**, encoder **NVIDIA NVENC HEVC**,
   rate control **CQP**, CQ level **20**, preset P5. Close OBS.
6. **Steam:** in the game's Properties, launch options `-FastLaunch`.
7. **Auto-logon:** the first boot set it; check by restarting Windows
   from the DCV session and reconnecting (the desktop is there, signed in).
   Leave the game in the free flight, and disconnect.

### 6. `trial.sh run`

```
infra/sim-trial/trial.sh run --resolution both
```

It puts the agent's source and the track in the bucket and has SSM Run
Command build the agent on the instance against the SDK and run it on the
signed-in desktop, 4K first, then 1440p. The track is
`tools/msfs-agent/fixtures/n901tq-2026-11-11-sedona.json`: N901TQ, a PA-28,
two circuits at Sedona from 23:40 UTC on 2026-11-11 (sunset light), 19
minutes, with one gap of 119 s over the first landing's roll, which the
replay cuts rather than bridges. Each run takes the flight's own time. Any
other Studio track works:
`tools/msfs-agent/prepare-track.sh <N-number> <day> [from to]` with the
stack up, then `run --track <file>`. `--shots chase:45,flyby:14,...`
changes the camera list (chase, flyby, tower, cockpit).

The agent logs every step to `runs/<run>/agent.log.jsonl`; SSM keeps its
console under `ssm/<run>/`.

### 7. Review

```
infra/sim-trial/trial.sh down
infra/sim-trial/trial.sh fetch
```

`sim-trial-out/runs/<run>/` holds the recording, `agent.log.jsonl`,
`summary.json` (the shots and the height offset measured) and the run's
logs. Watch for: the airplane on the runway at both landings (not under or
over it), the turns banked the right way (if outwards, add `--flip-bank`
to the agent in `run-replay.ps1`), smooth motion with no jumps at reports,
the cut at the gap, the cameras, the light at 23:40Z, dropped frames, and
how 4K compares with 1440p at the same CQ.

### 8. `trial.sh destroy`

Type `destroy` when asked. It empties and deletes the bucket, deletes the
stack (the instance, its disk with MSFS on it, the roles, the alarm, the
budget) and the two passwords.

## Not yet known (the trial finds out)

- **MSFS 2024 on Windows Server.** Steam lists Windows 10 as the minimum;
  Server 2025 is Windows 11's base, and the Xbox sign-in may want parts
  Server leaves out. This is question 1.
- **The gaming driver's Windows build.** The guide says to pick the build
  for the OS; whether `windows/latest` has one for Server 2025 is seen in
  the setup log. Its silent switches (`-s -noreboot`) are NVIDIA's usual
  ones, not in AWS's guide.
- **The agent's SimConnect half** (`SimConnectSim.cs`) is written from the
  MSFS 2024 SDK's documentation and has not been compiled: the managed
  SimConnect assembly comes only with the SDK. The first `run` builds it;
  a compile error there is fixed on the branch and run again. In
  particular: the managed names of the Camera API (beta) and its
  `SIMCONNECT_DATA_CAMERA` members, the World referential's altitude unit
  (taken as metres, possibly over the ellipsoid, so a tower or flyby
  camera may sit tens of metres off), the attitude simvars' signs, whether
  the ZULU_*_SET events and FlightLoad work in 2024, and the SDK's
  `MSFS2024_SDK` variable and folder layout.
- **Weather.** SimConnect's weather calls are deprecated in MSFS 2024, so
  the METAR cannot be set: the run flies in whatever weather the free
  flight has.
- **Unattended rendering.** Whether the simulator keeps drawing at 4K with
  no DCV client connected (DCV's console display is set to 3840x2160 for
  this), and whether OBS's Game Capture of a full-screen window works
  there; obs-websocket's settings are set by hand in step 5.
- **Install size and speed** of MSFS 2024 on the instance, the time from
  launch to a flight, and the frame rate on an L40S at 4K.

## Sources (read 2026-11-12)

- EC2 User Guide: NVIDIA drivers by instance type; Install NVIDIA gaming
  drivers (G7, G7e, G6, G6e, G5, and G4dn instances), Windows.
- DCV Administrator Guide: License the Amazon DCV Server (on EC2, no
  licence server); Installing the server on Windows, unattended.
  download.amazondcv.com/latest.html for the MSI.
- Systems Manager User Guide: Calling AMI public parameters
  (`/aws/service/ami-windows-latest/...`).
- EC2 instance type quotas: Running On-Demand G and VT instances,
  default 0, adjustable.
- AWS price list (EC2 on-demand, Windows), published 2026-11-10.
- Cost Management User Guide: Managing your costs with AWS Budgets.
- MSFS 2024 SDK documentation: SimConnect API Reference, the Camera API
  (beta), SIMCONNECT_DATA_CAMERA, the weather functions (deprecated).
- Steam: refunds; the MSFS 2024 store page (app 2537590).
- OBS Studio's releases (33.0.1) and obs-websocket-dotnet 5.7.0 (MIT).
