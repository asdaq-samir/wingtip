// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ListChoices, ListRow } from "./GroupedList";

afterEach(cleanup);

describe("ListRow on the stock Button", () => {
  it("is one button the row's height, its tap the caller's", () => {
    const onClick = vi.fn();
    render(<ListRow title="Saved flights" onClick={onClick} data-testid="row" />);
    const row = screen.getByRole("button", { name: "Saved flights" });
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
