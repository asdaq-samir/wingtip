package com.northflyers.wingtip.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import lombok.Getter;

/** Something due on an airplane that its owner keeps (V32): an AD's
 *  status -- its number and revision date as `reference`, the method of
 *  compliance, and when the next action is required, by day, by time in
 *  service or both (14 CFR 91.417(a)(2)(v)) -- or any other item. */
@Entity
@Table(name = "aircraft_due_items")
@Getter
public class AircraftDueItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "aircraft_id", nullable = false)
    private Aircraft aircraft;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 8)
    private DueItemKind kind;

    @Column(nullable = false, length = 120)
    private String title;

    @Column(length = 60)
    private String reference;

    @Column(length = 200)
    private String method;

    private LocalDate dueOn;

    private Double dueAtHours;

    protected AircraftDueItem() {
        // JPA
    }

    public AircraftDueItem(Aircraft aircraft) {
        this.aircraft = aircraft;
    }

    /** Every field at once, as its form sends them. */
    public AircraftDueItem set(DueItemKind kind, String title, String reference, String method, LocalDate dueOn,
                               Double dueAtHours) {
        this.kind = kind;
        this.title = title;
        this.reference = reference;
        this.method = method;
        this.dueOn = dueOn;
        this.dueAtHours = dueAtHours;
        return this;
    }
}
