import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";

import { dashcard, hasBasicFilterOptions, setup, user } from "./setup";

describe("DashboardSubscriptionsSidebar", () => {
  it("should forward non-admin to email form - when slack is not setup", async () => {
    setup({ isAdmin: false, email: true, slack: false });

    expect(await screen.findByText("Email this dashboard")).toBeInTheDocument();
  });

  it("should forward non-admin to slack form - when email is not setup", async () => {
    setup({ isAdmin: false, email: false, slack: true });

    expect(
      await screen.findByText("Send this dashboard to Slack"),
    ).toBeInTheDocument();
  });

  it("should not forward non-admins - when slack and email are both setup", async () => {
    setup({ isAdmin: false, email: true, slack: true });

    expect(await screen.findByText("Email it")).toBeInTheDocument();
    expect(await screen.findByText("Send it to Slack")).toBeInTheDocument();
  });

  it("should not forward admins to email - when slack is not setup", async () => {
    setup({ isAdmin: true, email: true, slack: false });

    expect(await screen.findByText("Email it")).toBeInTheDocument();
    expect(await screen.findByText("Configure Slack")).toBeInTheDocument();
  });

  it("should not forward admins to slack - when email is not setup", async () => {
    setup({ isAdmin: true, email: false, slack: true });

    expect(await screen.findByText("Set up email")).toBeInTheDocument();
    expect(await screen.findByText("Send it to Slack")).toBeInTheDocument();
  });

  describe("Slack Subscription sidebar", () => {
    it("should not show advanced filter options in OSS", async () => {
      setup();
      await userEvent.click(await screen.findByText("Send it to Slack"));

      await screen.findByText("Send this dashboard to Slack");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });
  });

  describe("Email Subscription sidebar", () => {
    it("should not show advanced filter options in OSS", async () => {
      setup();
      await userEvent.click(await screen.findByText("Email it"));

      await screen.findByText("Email this dashboard");

      expect(hasBasicFilterOptions(screen)).toBe(true);
    });

    it("should filter out actions and links when sending a test subscription", async () => {
      setup();

      await userEvent.click(await screen.findByText("Email it"));
      await userEvent.click(
        await screen.findByPlaceholderText(
          "Enter user names or email addresses",
        ),
      );

      await userEvent.click(
        await screen.findByText(`${user.first_name} ${user.last_name}`),
      );

      await userEvent.click(await screen.findByText("Send email now"));

      const payload = await fetchMock
        ?.lastCall("path:/api/pulse/test")
        ?.request?.json();
      expect(payload.cards).toHaveLength(1);
      expect(payload.cards[0].id).toEqual(dashcard.id);
    });
  });
});
