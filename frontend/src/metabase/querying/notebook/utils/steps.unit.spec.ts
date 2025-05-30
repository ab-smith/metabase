import { createMockMetadata } from "__support__/metadata";
import { checkNotNull } from "metabase/lib/types";
import * as Lib from "metabase-lib";
import { createQueryWithClauses } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { StructuredQuery as StructuredQueryObject } from "metabase-types/api";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getQuestionSteps } from "./steps";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const database = checkNotNull(metadata.database(SAMPLE_DB_ID));

const rawDataQuery: StructuredQueryObject = {
  "source-table": ORDERS_ID,
};

const summarizedQuery: StructuredQueryObject = {
  ...rawDataQuery,
  aggregation: [["count"]],
  breakout: [
    [
      "field",
      PRODUCTS.CATEGORY,
      { "source-field": ORDERS.PRODUCT_ID, "base-type": "type/Integer" },
    ],
  ],
};

const filteredQuery: StructuredQueryObject = {
  ...rawDataQuery,
  filter: ["=", ["field", ORDERS.USER_ID, { "base-type": "type/Integer" }], 1],
};

const filteredAndSummarizedQuery: StructuredQueryObject = {
  ...summarizedQuery,
  ...filteredQuery,
};

const postAggregationFilterQuery: StructuredQueryObject = {
  "source-query": filteredAndSummarizedQuery,
  filter: [">", ["field", "count", { "base-type": "type/Integer" }], 10],
  aggregation: [["count"]],
};

const getQuestionStepsForMBQLQuery = (query: StructuredQueryObject) => {
  const question = Question.create({
    metadata,
    dataset_query: { database: database.id, type: "query", query },
  });
  return getQuestionSteps(question, metadata, {});
};

const getMetricStepsForMBQLQuery = (query: StructuredQueryObject) => {
  const question = Question.create({
    metadata,
    dataset_query: { database: database.id, type: "query", query },
    cardType: "metric",
  });
  return getQuestionSteps(question, metadata, {});
};

describe("raw data query", () => {
  const steps = getQuestionStepsForMBQLQuery(rawDataQuery);
  const [dataStep] = steps;

  describe("getQuestionSteps", () => {
    it("should return data step with actions", () => {
      expect(steps.length).toBe(1);
      expect(dataStep.type).toBe("data");
      expect(dataStep.actions.map((action) => action.type)).toEqual([
        "join",
        "expression",
        "filter",
        "summarize",
        "sort",
        "limit",
      ]);
    });
  });
});

describe("filtered and summarized query", () => {
  const steps = getQuestionStepsForMBQLQuery(filteredAndSummarizedQuery);
  const [dataStep, filterStep, summarizeStep] = steps;

  describe("getQuestionSteps", () => {
    it("`getQuestionSteps()` should return data, filter, and summarize steps", () => {
      expect(steps.map((s) => s.type)).toEqual(["data", "filter", "summarize"]);
    });

    it("should allow adding a new stage for questions", () => {
      expect(summarizeStep.type).toBe("summarize");
      expect(summarizeStep.actions.map(({ type }) => type)).toEqual([
        "sort",
        "limit",
        "join",
        "expression",
        "filter",
        "summarize",
      ]);
    });

    it("should allow reverting the summarize step for regular queries", () => {
      const [_dataStep, _filterStep, summarizeStep] = steps;
      expect(summarizeStep.type).toBe("summarize");
      expect(summarizeStep.revert).toBeDefined();
    });

    it("should not allow reverting the summarize step for metrics", () => {
      const steps = getMetricStepsForMBQLQuery(filteredAndSummarizedQuery);
      const [_dataStep, _filterStep, summarizeStep] = steps;
      expect(summarizeStep.type).toBe("summarize");
      expect(summarizeStep.revert).toBeNull();
    });

    it("should not allow adding a new stage for metrics", () => {
      const steps = getMetricStepsForMBQLQuery(filteredAndSummarizedQuery);
      const [dataStep, filterStep, summarizeStep] = steps;
      expect(dataStep.type).toBe("data");
      expect(filterStep.type).toBe("filter");
      expect(summarizeStep.type).toBe("summarize");
      expect(summarizeStep.actions.map(({ type }) => type)).toEqual([
        "sort",
        "limit",
      ]);
    });
  });

  describe("query", () => {
    it("should be the same for all steps", () => {
      const { query } = dataStep;

      expect(filterStep.query).toBe(query);
      expect(summarizeStep.query).toBe(query);
    });
  });

  describe("previewQuery", () => {
    it("shouldn't include filter, summarize for data step", () => {
      const previewQuery = checkNotNull(dataStep.previewQuery);

      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(0);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(0);
    });

    it("shouldn't include summarize for filter step", () => {
      const previewQuery = checkNotNull(filterStep.previewQuery);

      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(0);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(1);
    });
  });

  describe("revert", () => {
    it("shouldn't remove summarize when removing filter", () => {
      const newQuery = checkNotNull(filterStep.revert?.(filterStep.query, 0));

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 0)).toHaveLength(0);
    });

    it("shouldn't remove filter when removing summarize", () => {
      const newQuery = checkNotNull(
        summarizeStep.revert?.(summarizeStep.query, 0),
      );

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(0);
      expect(Lib.filters(newQuery, 0)).toHaveLength(1);
    });
  });
});

describe("filtered and summarized query with post-aggregation filter", () => {
  const steps = getQuestionStepsForMBQLQuery(postAggregationFilterQuery);
  const [dataStep, filterStep, summarizeStep, postAggregationFilterStep] =
    steps;

  describe("getQuestionSteps", () => {
    it("`getQuestionSteps()` should return [data, filter, summarize] and [filter, summarize] steps", () => {
      expect(steps.map((s) => s.type)).toEqual([
        "data",
        "filter",
        "summarize",
        "filter",
        "summarize",
      ]);
    });
  });

  describe("query", () => {
    it("should be the same for all steps", () => {
      const { query } = dataStep;

      expect(filterStep.query).toBe(query);
      expect(summarizeStep.query).toBe(query);
      expect(postAggregationFilterStep.query).toBe(query);
    });
  });

  describe("previewQuery", () => {
    it("shouldn't include filter, summarize, or post-aggregation filter for data step", () => {
      const previewQuery = checkNotNull(dataStep.previewQuery);

      expect(Lib.stageCount(previewQuery)).toBe(1);
      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(0);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(0);
    });

    it("shouldn't include summarize or post-aggregation filter for filter step", () => {
      const previewQuery = checkNotNull(filterStep.previewQuery);

      expect(Lib.stageCount(previewQuery)).toBe(1);
      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(0);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(1);
    });

    it("shouldn't include filters from the next stages for summarizeStep", () => {
      const previewQuery = checkNotNull(summarizeStep.previewQuery);

      expect(Lib.stageCount(previewQuery)).toBe(1);
      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(1);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(1);
    });

    it("shouldn't include aggregations for post-aggregation filter step", () => {
      const previewQuery = checkNotNull(postAggregationFilterStep.previewQuery);

      expect(Lib.stageCount(previewQuery)).toBe(2);
      expect(Lib.aggregations(previewQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(previewQuery, 0)).toHaveLength(1);
      expect(Lib.filters(previewQuery, 0)).toHaveLength(1);
      expect(Lib.filters(previewQuery, 1)).toHaveLength(1);
      expect(Lib.aggregations(previewQuery, 1)).toHaveLength(0);
    });
  });

  describe("revert", () => {
    it("shouldn't remove summarize or post-aggregation filter when removing filter", () => {
      const newQuery = checkNotNull(filterStep.revert?.(filterStep.query, 0));

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 0)).toHaveLength(0);
      expect(Lib.filters(newQuery, 1)).toHaveLength(1);
    });

    it("should remove post-aggregation filter when removing summarize", () => {
      const newQuery = checkNotNull(
        summarizeStep.revert?.(summarizeStep.query, 0),
      );

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(0);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(0);
      expect(Lib.filters(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 1)).toHaveLength(0);
    });

    it("should not remove filter or summarize when removing post-aggregation filter", () => {
      const newQuery = checkNotNull(
        postAggregationFilterStep.revert?.(postAggregationFilterStep.query, 1),
      );

      expect(Lib.aggregations(newQuery, 0)).toHaveLength(1);
      expect(Lib.breakouts(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 0)).toHaveLength(1);
      expect(Lib.filters(newQuery, 1)).toHaveLength(0);
    });
  });
});

describe("aggregated query without breakout", () => {
  it("provides 'join data' and 'custom column' actions", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
    });

    const baseQuestion = Question.create({
      databaseId: SAMPLE_DB_ID,
      metadata,
    });

    const question = baseQuestion.setQuery(query);

    const steps = getQuestionSteps(question, metadata, {});

    expect(
      steps
        .find((step) => step.type === "summarize")
        ?.actions.map((action) => action.type),
    ).toEqual(["join", "expression"]);
  });
});
