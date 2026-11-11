package app.wingtipmaps.gateway.domain;

/** What an airplane's due item is: an airworthiness directive (14 CFR part
 *  39; its status kept as 91.417(a)(2)(v) asks), or anything else its owner
 *  wants reminded of. */
public enum DueItemKind {
    AD,
    OTHER
}
