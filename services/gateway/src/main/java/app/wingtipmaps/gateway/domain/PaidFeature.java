package app.wingtipmaps.gateway.domain;

/**
 * What the subscription unlocks, each as a pilot reads it in a sentence.
 * Planning and flying -- the chart, the route, checkpoints, the nav log,
 * altitudes, fuel, weather, airspace, the Go / No-Go -- are free and are
 * none of these: nothing that keeps a pilot legal or safe is paid for.
 *
 * <p>The features Claude wrote (the written briefing, checkpoint
 * descriptions, the mock oral, the assistant, the readings in words) were
 * taken out on the owner's word of 2026-11-12 (docs/decisions/0041); the
 * debrief, measured on the device, is what is left.
 */
public enum PaidFeature {
    DEBRIEF("The debrief comes");

    private final String comes;

    PaidFeature(String comes) {
        this.comes = comes;
    }

    /** "The debrief comes", a sentence's start, its verb agreeing. */
    public String comes() {
        return comes;
    }

    /** "the debrief", as a sentence's object. */
    public String object() {
        String title = comes.substring(0, comes.lastIndexOf(' '));
        return Character.toLowerCase(title.charAt(0)) + title.substring(1);
    }
}
