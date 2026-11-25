// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ListChoices, ListGroup, ListRow } from "./GroupedList";
import { InSection } from "./sectionLayout";
import { GROUP_LABEL, SECTION_TITLE } from "../lib/text";

afterEach(cleanup);

describe("ListRow on the stock Button", () => {
  it("is one button the row's height, its tap the caller's", () => {
    const onClick = vi.fn();
    render(<ListRow title="Saved Flights" onClick={onClick} data-testid="row" />);
    const row = screen.getByRole("button", { name: "Saved Flights" });
    expect(row.getAttribute("type")).toBe("button");
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("is a radio of its group, checked by the group's value", () => {
    const onChange = vi.fn();
    render(
      <ListChoices value="day" onChange={onChange} label="Theme">
        <ListRow radio="day" title="Day" />
        <ListRow radio="night" title="Night" />
      </ListChoices>,
    );
    expect(screen.getByRole("radio", { name: "Day" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Night" }));
    expect(onChange).toHaveBeenCalledWith("night");
  });
});

describe("ListGroup's title", () => {
  it("is a section's title on its own and a group's label inside a section", () => {
    const group = (
      <ListGroup title="From the Briefing">
        <ListRow title="Night" />
      </ListGroup>
    );
    const { unmount } = render(group);
    expect(screen.getByRole("heading", { name: "From the Briefing" }).className).toBe(SECTION_TITLE);
    unmount();
    render(<InSection.Provider value>{group}</InSection.Provider>);
    const label = screen.getByRole("heading", { name: "From the Briefing" }).className;
    expect(label).toBe(GROUP_LABEL);
  });
});
