import React from "react";
import StatsSummary, { StatsSummaryCurrent, StatsSummaryOverall } from "../Stats/StatsSummary";
import LineChart from "../Stats/LineChart";
import PercentBar from "../Stats/PercentBar";
import BarChart from "../Stats/BarChart";
import TimeTable from "../Stats/TimeTable";

function noop() {}

function StatShareCanvas({ statShare }) {
  const render = statShare?.render || {};
  const cardKey = render.cardKey || statShare?.cardKey || statShare?.kind || "summary";
  const summaryProps = {
    solves: render.solves || [],
    overallSolves: render.overallSolves || [],
    overallStats: render.overallStats || null,
    allEventsBreakdown: render.allEventsBreakdown || null,
    mode: render.mode || "session",
    selectedEvent: render.selectedEvent,
    selectedSession: render.selectedSession,
    loadedSolveCount: render.loadedSolveCount ?? null,
    showCurrentMetrics: render.showCurrentMetrics !== false,
    viewMode: render.viewMode || "standard",
    selectedDay: render.selectedDay || "",
  };

  if (cardKey === "summary") {
    return (
      <div className="stats-item stats-item--header sharedStatExact sharedStatExact--header">
        <StatsSummary {...summaryProps} />
      </div>
    );
  }

  if (cardKey === "summary-current") {
    return (
      <div className="stats-item stats-item--header sharedStatExact sharedStatExact--header">
        <StatsSummaryCurrent {...summaryProps} />
      </div>
    );
  }

  if (cardKey === "summary-overall") {
    return (
      <div className="stats-item stats-item--header sharedStatExact sharedStatExact--header">
        <StatsSummaryOverall {...summaryProps} />
      </div>
    );
  }

  if (cardKey === "line") {
    return (
      <div className="stats-item stats-item--line sharedStatExact">
        <LineChart
          user={null}
          solves={render.solves || []}
          comparisonSeries={render.comparisonSeries || []}
          seriesStyle={render.seriesStyle || null}
          legendItems={render.legendItems || []}
          title={statShare?.title || render.title || ""}
          deleteTime={noop}
          addPost={noop}
          applyPenalty={noop}
          setSessions={noop}
          sessionsList={[]}
          currentEvent={render.currentEvent || "333"}
          currentSession={render.currentSession || "main"}
          eventKey={render.eventKey || render.currentEvent || "333"}
          practiceMode={false}
          allowViewPicker={true}
          viewMode={render.viewMode || "standard"}
          selectedDay={render.selectedDay || ""}
          onSelectedDayChange={noop}
        />
      </div>
    );
  }

  if (cardKey === "percent") {
    return (
      <div className="stats-item stats-item--percent sharedStatExact">
        <PercentBar
          solves={render.solves || []}
          comparisonSeries={render.comparisonSeries || []}
          legendItems={render.legendItems || []}
          title={render.title || "Solves Distribution by Time"}
        />
      </div>
    );
  }

  if (cardKey === "bar") {
    return (
      <div className="stats-item stats-item--bar sharedStatExact">
        <BarChart
          solves={render.solves || []}
          comparisonSeries={render.comparisonSeries || []}
          seriesStyle={render.seriesStyle || null}
          legendItems={render.legendItems || []}
        />
      </div>
    );
  }

  if (cardKey === "table") {
    return (
      <div className="stats-item stats-item--table sharedStatExact">
        <TimeTable
          user={null}
          solves={render.solves || []}
          seriesStyle={render.seriesStyle || null}
          deleteTime={noop}
          addPost={noop}
          applyPenalty={noop}
          setSessions={noop}
          sessionsList={[]}
          currentEvent={render.currentEvent || "333"}
          currentSession={render.currentSession || "main"}
          eventKey={render.eventKey || render.currentEvent || "333"}
          practiceMode={false}
        />
      </div>
    );
  }

  return null;
}

function StatSharePost({ note = "", statShare = null }) {
  const trimmedNote = String(note || "").trim();
  const cardKey = statShare?.render?.cardKey || statShare?.cardKey || statShare?.kind || "summary";
  const showHeader = !String(cardKey).startsWith("summary");

  return (
    <div className="statSharePostShell">
      {trimmedNote ? <div className="postCaption">{trimmedNote}</div> : null}
      {showHeader && (statShare?.title || statShare?.contextLabel || statShare?.highlightValue) ? (
        <div className="statSharePostHeader">
          <div>
            {statShare?.title ? <div className="statSharePostTitle">{statShare.title}</div> : null}
            {statShare?.contextLabel ? <div className="statSharePostContext">{statShare.contextLabel}</div> : null}
          </div>
          {statShare?.highlightValue ? (
            <div className="statSharePostHighlight">{statShare.highlightValue}</div>
          ) : null}
        </div>
      ) : null}
      <StatShareCanvas statShare={statShare} />
    </div>
  );
}

export default StatSharePost;
