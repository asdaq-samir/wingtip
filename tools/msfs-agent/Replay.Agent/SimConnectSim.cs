using System.Runtime.InteropServices;
using Microsoft.FlightSimulator.SimConnect;

namespace Wingtip.Replay.Agent;

/// <summary>
/// MSFS 2024 through SimConnect's managed API (the SDK's
/// Microsoft.FlightSimulator.SimConnect), out of process. Built only on the
/// trial's instance, against the SDK there; written from the SDK's
/// documentation (docs.flightsimulator.com/msfs2024, SimConnect API
/// Reference) and not yet compiled, so its first build is part of the
/// trial (infra/sim-trial/README.md, "Not yet known").
///
/// The airplane is held with the freeze events (FREEZE_LATITUDE_LONGITUDE_SET,
/// FREEZE_ALTITUDE_SET, FREEZE_ATTITUDE_SET) and put in place every frame
/// with the PLANE LATITUDE, LONGITUDE, ALTITUDE, PITCH, BANK and HEADING
/// simvars, which are settable; the frames come from the "Frame" system
/// event. The cameras are the add-on camera of the Camera API (beta in the
/// SDK): acquired once, set per shot.
/// </summary>
public sealed class SimConnectSim : ISim
{
    enum Def { Pose, Ground, Wheels }
    enum Req { Ground, Wheels, SimState }
    enum Ev { Frame, FreezePosition, FreezeAltitude, FreezeAttitude, ZuluYear, ZuluDay, ZuluHours, ZuluMinutes }
    enum Group { Standard = 1_900_000_000 }

    const string ClientId = "Wingtip replay";

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct SimPose
    {
        public double Lat, Lon, AltFt, Pitch, Bank, Heading;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct OneNumber
    {
        public double Value;
    }

    readonly StepLog _log;
    readonly bool _flipBank;
    readonly EventWaitHandle _signal = new(false, EventResetMode.AutoReset);
    readonly CancellationTokenSource _stop = new();
    SimConnect? _sc;
    Thread? _pump;
    TaskCompletionSource _open = New();
    TaskCompletionSource _frame = New();
    TaskCompletionSource<double> _number = New<double>();
    TaskCompletionSource<int> _state = New<int>();

    public SimConnectSim(StepLog log, bool flipBank) => (_log, _flipBank) = (log, flipBank);

    static TaskCompletionSource New() => new(TaskCreationOptions.RunContinuationsAsynchronously);
    static TaskCompletionSource<T> New<T>() => new(TaskCreationOptions.RunContinuationsAsynchronously);

    SimConnect Sc => _sc ?? throw new InvalidOperationException("Not connected to the simulator.");

    public async Task ReadyAsync(TimeSpan wait, string? flightFile, CancellationToken cancel)
    {
        var deadline = DateTime.UtcNow + wait;
        while (_sc is null)
        {
            try
            {
                _sc = new SimConnect(ClientId, IntPtr.Zero, 0, _signal, 0);
            }
            catch (COMException) when (DateTime.UtcNow < deadline)
            {
                _log.Step("sim.waiting", new { reason = "SimConnect not answering yet" });
                await Task.Delay(TimeSpan.FromSeconds(10), cancel);
            }
        }
        Wire();
        _pump = new Thread(Pump) { IsBackground = true, Name = "SimConnect" };
        _pump.Start();
        await _open.Task.WaitAsync(TimeSpan.FromSeconds(30), cancel);
        _log.Step("sim.connected");

        // "Sim" is 1 while the pilot's airplane is in a flight (SimConnect_RequestSystemState).
        var loaded = false;
        while (true)
        {
            _state = New<int>();
            Sc.RequestSystemState(Req.SimState, "Sim");
            if (await _state.Task.WaitAsync(TimeSpan.FromSeconds(10), cancel) == 1) break;
            if (flightFile is not null && !loaded)
            {
                Sc.FlightLoad(flightFile);
                loaded = true;
                _log.Step("sim.flight-load", new { flightFile });
            }
            if (DateTime.UtcNow > deadline) throw new TimeoutException("The simulator is not in a flight: start a free flight in the DCV session, or pass --flight.");
            _log.Step("sim.waiting", new { reason = "not in a flight yet" });
            await Task.Delay(TimeSpan.FromSeconds(10), cancel);
        }
        _log.Step("sim.in-flight");
        Sc.CameraAcquire(ClientId);
    }

    void Wire()
    {
        var sc = Sc;
        sc.OnRecvOpen += (_, _) => _open.TrySetResult();
        sc.OnRecvQuit += (_, _) => _log.Step("sim.quit");
        sc.OnRecvException += (_, e) => _log.Step("sim.exception", new { exception = ((SIMCONNECT_EXCEPTION)e.dwException).ToString(), e.dwSendID, e.dwIndex });
        sc.OnRecvEventFrame += (_, _) => _frame.TrySetResult();
        sc.OnRecvSystemState += (_, s) => _state.TrySetResult((int)s.dwInteger);
        sc.OnRecvSimobjectData += (_, d) => _number.TrySetResult(((OneNumber)d.dwData[0]).Value);

        Add(Def.Pose, "PLANE LATITUDE", "degrees");
        Add(Def.Pose, "PLANE LONGITUDE", "degrees");
        Add(Def.Pose, "PLANE ALTITUDE", "feet");
        Add(Def.Pose, "PLANE PITCH DEGREES", "degrees");
        Add(Def.Pose, "PLANE BANK DEGREES", "degrees");
        Add(Def.Pose, "PLANE HEADING DEGREES TRUE", "degrees");
        sc.RegisterDataDefineStruct<SimPose>(Def.Pose);
        Add(Def.Ground, "GROUND ALTITUDE", "feet");
        sc.RegisterDataDefineStruct<OneNumber>(Def.Ground);
        Add(Def.Wheels, "STATIC CG TO GROUND", "feet");
        sc.RegisterDataDefineStruct<OneNumber>(Def.Wheels);

        sc.SubscribeToSystemEvent(Ev.Frame, "Frame");
        sc.MapClientEventToSimEvent(Ev.FreezePosition, "FREEZE_LATITUDE_LONGITUDE_SET");
        sc.MapClientEventToSimEvent(Ev.FreezeAltitude, "FREEZE_ALTITUDE_SET");
        sc.MapClientEventToSimEvent(Ev.FreezeAttitude, "FREEZE_ATTITUDE_SET");
        sc.MapClientEventToSimEvent(Ev.ZuluYear, "ZULU_YEAR_SET");
        sc.MapClientEventToSimEvent(Ev.ZuluDay, "ZULU_DAY_SET");
        sc.MapClientEventToSimEvent(Ev.ZuluHours, "ZULU_HOURS_SET");
        sc.MapClientEventToSimEvent(Ev.ZuluMinutes, "ZULU_MINUTES_SET");

        void Add(Def def, string name, string unit) =>
            sc.AddToDataDefinition(def, name, unit, SIMCONNECT_DATATYPE.FLOAT64, 0, SimConnect.SIMCONNECT_UNUSED);
    }

    void Pump()
    {
        while (!_stop.IsCancellationRequested)
        {
            if (!_signal.WaitOne(500)) continue;
            try
            {
                _sc?.ReceiveMessage();
            }
            catch (COMException err)
            {
                _log.Step("sim.receive-failed", new { err.Message });
            }
        }
    }

    void Send(Ev ev, uint data) =>
        Sc.TransmitClientEvent(SimConnect.SIMCONNECT_OBJECT_ID_USER, ev, data, Group.Standard, SIMCONNECT_EVENT_FLAG.GROUPID_IS_PRIORITY);

    public void Freeze(bool hold)
    {
        var data = hold ? 1u : 0u;
        Send(Ev.FreezePosition, data);
        Send(Ev.FreezeAltitude, data);
        Send(Ev.FreezeAttitude, data);
    }

    public void SetZulu(DateTime utc)
    {
        Send(Ev.ZuluYear, (uint)utc.Year);
        Send(Ev.ZuluDay, (uint)utc.DayOfYear);
        Send(Ev.ZuluHours, (uint)utc.Hour);
        Send(Ev.ZuluMinutes, (uint)utc.Minute);
    }

    async Task<double> ReadAsync(Def def, Req req, CancellationToken cancel)
    {
        _number = New<double>();
        Sc.RequestDataOnSimObject(req, def, SimConnect.SIMCONNECT_OBJECT_ID_USER, SIMCONNECT_PERIOD.ONCE, SIMCONNECT_DATA_REQUEST_FLAG.DEFAULT, 0, 0, 0);
        return await _number.Task.WaitAsync(TimeSpan.FromSeconds(10), cancel);
    }

    public async Task<double> GroundFtAsync(double lat, double lon, CancellationToken cancel)
    {
        // The ground is read under the airplane: put it there, high, and
        // give the terrain a moment to load before asking.
        Sc.SetDataOnSimObject(Def.Pose, SimConnect.SIMCONNECT_OBJECT_ID_USER, SIMCONNECT_DATA_SET_FLAG.DEFAULT,
            new SimPose { Lat = lat, Lon = lon, AltFt = 15_000 });
        await Task.Delay(TimeSpan.FromSeconds(5), cancel);
        return await ReadAsync(Def.Ground, Req.Ground, cancel);
    }

    public Task<double> WheelHeightFtAsync(CancellationToken cancel) => ReadAsync(Def.Wheels, Req.Wheels, cancel);

    public void Place(Pose pose) =>
        Sc.SetDataOnSimObject(Def.Pose, SimConnect.SIMCONNECT_OBJECT_ID_USER, SIMCONNECT_DATA_SET_FLAG.DEFAULT, new SimPose
        {
            Lat = pose.Lat,
            Lon = pose.Lon,
            AltFt = pose.AltFt,
            // The SDK counts these the other way from a pilot: nose down and
            // left wing down positive, as FSX's simvars did. --flip-bank
            // turns the bank round should the first run show otherwise.
            Pitch = -pose.PitchDeg,
            Bank = _flipBank ? pose.BankDeg : -pose.BankDeg,
            Heading = pose.HeadingDeg,
        });

    public void Aim(Camera camera)
    {
        // SIMCONNECT_DATA_CAMERA (Camera API): offsets in metres in the
        // airplane's and the eye's frames; in the world, latitude, longitude
        // and altitude, taken here as metres (the documentation does not say;
        // the SDK forum reads it as height over the ellipsoid, so a world
        // camera may sit some tens of metres off its height). One that looks
        // at the airplane aims at its reference point in the airplane's frame.
        var world = camera.Frame == CameraFrame.World;
        var data = new SIMCONNECT_DATA_CAMERA
        {
            PositionReferential = camera.Frame switch
            {
                CameraFrame.World => SIMCONNECT_POSITION_REFERENTIAL.WORLD,
                CameraFrame.Eyepoint => SIMCONNECT_POSITION_REFERENTIAL.EYEPOINT,
                _ => SIMCONNECT_POSITION_REFERENTIAL.SIMOBJECT,
            },
            PositionReferentialObjectId = 0,
            Position = new SIMCONNECT_DATA_XYZ { x = camera.X, y = camera.Y, z = world ? camera.Z / Geo.FtPerM : camera.Z },
            RotationReferential = camera.Frame == CameraFrame.Eyepoint ? SIMCONNECT_POSITION_REFERENTIAL.EYEPOINT : SIMCONNECT_POSITION_REFERENTIAL.SIMOBJECT,
            RotationReferentialObjectId = 0,
            TargetedPos = new SIMCONNECT_DATA_XYZ { x = 0, y = 0, z = 0 },
            Pbh = new SIMCONNECT_DATA_PBH { Pitch = 0, Bank = 0, Heading = 0 },
            Fov = camera.FovDeg * Math.PI / 180,
        };
        var mask = camera.LooksAtAirplane ? SIMCONNECT_CAMERA_DATA_MASK.ALL_TARGETED : SIMCONNECT_CAMERA_DATA_MASK.ALL_ROTATION;
        Sc.CameraSet(data, (uint)mask);
    }

    public void ReleaseCamera() => _sc?.CameraRelease(ClientId);

    public async Task NextFrameAsync(CancellationToken cancel)
    {
        _frame = New();
        await _frame.Task.WaitAsync(TimeSpan.FromSeconds(10), cancel);
    }

    public async ValueTask DisposeAsync()
    {
        await _stop.CancelAsync();
        _pump?.Join(TimeSpan.FromSeconds(2));
        _sc?.Dispose();
        _signal.Dispose();
        _stop.Dispose();
    }
}
