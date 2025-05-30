import _userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { DATE_PICKER_UNITS } from "metabase/querying/filters/constants";
import type {
  DatePickerUnit,
  RelativeDatePickerValue,
} from "metabase/querying/filters/types";

import { CurrentDatePicker } from "./CurrentDatePicker";

const DEFAULT_VALUE: RelativeDatePickerValue = {
  type: "relative",
  value: 0,
  unit: "hour",
};

interface SetupOpts {
  value?: RelativeDatePickerValue;
  availableUnits?: DatePickerUnit[];
}

const userEvent = _userEvent.setup({
  advanceTimers: jest.advanceTimersByTime,
});

function setup({
  value = DEFAULT_VALUE,
  availableUnits = DATE_PICKER_UNITS,
}: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <CurrentDatePicker
      value={value}
      availableUnits={availableUnits}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("CurrentDatePicker", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2020, 0, 1));
  });

  it("should be able to filter by a current interval", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByText("Week"));

    expect(onChange).toHaveBeenCalledWith({
      type: "relative",
      value: 0,
      unit: "week",
    });
  });

  it("should show the date range for the selected interval", async () => {
    setup();

    await userEvent.hover(screen.getByText("Week"));

    expect(
      await screen.findByText("Right now, this is Dec 29, 2019 – Jan 4, 2020"),
    ).toBeInTheDocument();
  });
});
