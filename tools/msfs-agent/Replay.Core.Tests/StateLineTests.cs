using System.Text.Json;
using Xunit;

namespace Wingtip.Replay.Tests;

/// <summary>The state lines the agent sends the test flight's feed with
/// --feed: one a second, numbered, in the feed's fields.</summary>
public sealed class StateLineTests
{
    static readonly DateTime Start = new(2026, 11, 21, 15, 0, 0, DateTimeKind.Utc);

    static Pose At(double t, bool ground = false) => new(t, 43.1, -89.3, 5500, 35, 0, 0, 110, ground);

    [Fact]
    public void One_line_a_second_of_the_flights_clock()
    {
        var lines = new StateLine(Start);
        Assert.NotNull(lines.For(At(0)));
        Assert.Null(lines.For(At(0.5)));
        Assert.NotNull(lines.For(At(1.0)));
        Assert.NotNull(lines.For(At(0.2))); // a cut back in time starts again
    }

    [Fact]
    public void A_line_has_the_feeds_fields_in_feet_and_knots()
    {
        var line = JsonElement.Parse(new StateLine(Start).For(At(12.5))!);
        Assert.Equal("msfs", line.GetProperty("sim").GetString());
        Assert.Equal(1, line.GetProperty("seq").GetInt32());
        Assert.Equal(new DateTimeOffset(Start).ToUnixTimeSeconds() + 12.5, line.GetProperty("utc").GetDouble(), 3);
        Assert.Equal(5500, line.GetProperty("alt_ft").GetDouble());
        Assert.Equal(110, line.GetProperty("gs_kt").GetDouble());
        Assert.Equal(35, line.GetProperty("track_deg").GetDouble());
        Assert.False(line.GetProperty("done").GetBoolean());
    }

    [Fact]
    public void The_last_line_says_the_flight_is_done()
    {
        var lines = new StateLine(Start);
        lines.For(At(0));
        var done = JsonElement.Parse(lines.Done(At(60, ground: true)));
        Assert.True(done.GetProperty("done").GetBoolean());
        Assert.Equal(2, done.GetProperty("seq").GetInt32());
    }

    [Theory]
    [InlineData("127.0.0.1:49010", "127.0.0.1", 49010)]
    [InlineData("mac.local:4000", "mac.local", 4000)]
    public void The_feeds_address_is_read(string text, string host, int port) =>
        Assert.Equal((host, port), StateLine.Address(text));

    [Theory]
    [InlineData("127.0.0.1")]
    [InlineData(":49010")]
    [InlineData("host:0")]
    [InlineData("host:port")]
    public void An_address_without_a_port_is_refused(string text) =>
        Assert.Throws<FormatException>(() => StateLine.Address(text));
}
