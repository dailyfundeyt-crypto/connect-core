/**
 * Spark-Learn Study Mode UI Components (Lane 4)
 *
 * Exporting:
 * - StudyView (main component)
 * - StudySession (FSRS active recall flashcard runner)
 * - StudyDashboard (overview, queue, recommendations, goals)
 * - StudyGeneratorDialog (AI flashcard generation modal)
 * - StudySummaryView (cached note/folder summary reader)
 * - StudyStatsView (retention gauge & folder analytics)
 */

export * from "./types";
export * from "./study-session";
export * from "./study-dashboard";
export * from "./study-generator-dialog";
export * from "./study-summary-view";
export * from "./study-stats";
export * from "./study-view";

import { StudyView } from "./study-view";
export default StudyView;
