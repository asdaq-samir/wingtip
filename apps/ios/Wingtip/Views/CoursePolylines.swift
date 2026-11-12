import MapKit

/// A procedure's path, told from the course line by its class.
final class ProcedurePolyline: MKPolyline {}

/// The thin edge round the course's magenta, so it keeps its contrast on
/// the chart (the web's route-edge). The green casing is drawn only on the
/// leg whose sheet is open (RouteLegLayer), as ForeFlight shows it on a
/// selected course (the owner, 2026-11-09).
final class CourseEdgePolyline: MKPolyline {}
