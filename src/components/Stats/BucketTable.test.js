import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import BucketTable from "./BucketTable";

const bucketItems = [
  {
    BucketDay: "2017-06-03",
    SolveCountTotal: 12,
    SolveCountIncluded: 12,
    MeanMs: 15000,
    TagSummaries: [{ TagKey: "Competition", TagValue: "VirginiaOpen2017", SolveCountTotal: 10 }],
  },
  { BucketDay: "2017-06-10", SolveCountTotal: 5, SolveCountIncluded: 5, MeanMs: 14000 },
];

const competitions = [
  {
    CompetitionID: "VirginiaOpen2017",
    Name: "Virginia Open 2017",
    City: "Richmond",
    StartDay: "2017-06-03",
    EndDay: "2017-06-04",
  },
];

function setup() {
  window.localStorage.setItem("pts.bucketTable.view.v2", "calendar");
  const onBucketSelect = jest.fn();
  const onCompetitionOpen = jest.fn();
  render(
    <BucketTable
      bucketItems={bucketItems}
      competitions={competitions}
      onBucketSelect={onBucketSelect}
      onCompetitionOpen={onCompetitionOpen}
    />
  );
  return { onBucketSelect, onCompetitionOpen };
}

test("a competition day asks whether to open the competition or the whole day", () => {
  const { onBucketSelect, onCompetitionOpen } = setup();

  fireEvent.click(screen.getByRole("button", { name: /Jun 3, 2017, WCA: Virginia Open 2017/ }));
  expect(onBucketSelect).not.toHaveBeenCalled();
  expect(screen.getByText("10 competition, 2 other", { exact: false })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Virginia Open 2017.*All results/ }));
  expect(onCompetitionOpen).toHaveBeenCalledWith("VirginiaOpen2017");
});

test("the day button still opens every solve from that day", () => {
  const { onBucketSelect } = setup();

  fireEvent.click(screen.getByRole("button", { name: /Jun 3, 2017, WCA/ }));
  fireEvent.click(screen.getByRole("button", { name: /All solves this day/ }));
  expect(onBucketSelect).toHaveBeenCalledWith("2017-06-03");
});

test("a competition day without solves in this view can still open the competition", () => {
  const { onCompetitionOpen } = setup();

  const emptyDay = screen.getByRole("button", { name: /Jun 4, 2017, WCA/ });
  expect(emptyDay).not.toBeDisabled();
  fireEvent.click(emptyDay);
  expect(screen.getByText("No solves in this view on this day.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /All results/ }));
  expect(onCompetitionOpen).toHaveBeenCalledWith("VirginiaOpen2017");
});

test("ordinary days open straight away", () => {
  const { onBucketSelect } = setup();

  fireEvent.click(screen.getByRole("button", { name: "Jun 10, 2017" }));
  expect(onBucketSelect).toHaveBeenCalledWith("2017-06-10");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
