// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PhotoSlide } from "./PictureSlides";

// No test globals, so Testing Library leaves each render up unless told.
afterEach(cleanup);

describe("a photo's credit", () => {
  it("links to the photo's own page where it has one, as Commons' licences ask", () => {
    render(
      <PhotoSlide
        src="https://upload.wikimedia.org/x.jpg"
        alt=""
        label="KOSH from the ground"
        credit="Jane Doe · CC BY-SA 4.0"
        creditHref="https://commons.wikimedia.org/wiki/File:X.jpg"
        creditTestId="credit"
      />,
    );
    const credit = screen.getByTestId("credit");
    expect(credit.tagName).toBe("A");
    expect(credit.getAttribute("href")).toBe("https://commons.wikimedia.org/wiki/File:X.jpg");
    expect(credit.getAttribute("rel")).toBe("noopener noreferrer");
    expect(credit.textContent).toBe("Jane Doe · CC BY-SA 4.0");
  });

  it("is words alone where the photo has no page", () => {
    render(<PhotoSlide src="/aerial.jpg" alt="" label="KOSH from the air" credit="USGS" creditTestId="credit" />);
    expect(screen.getByTestId("credit").tagName).toBe("SPAN");
  });
});
