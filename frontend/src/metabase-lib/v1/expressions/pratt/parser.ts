import { t } from "ttag";

import { CompileError } from "../errors";

import {
  ADD,
  ARG_LIST,
  BAD_TOKEN,
  CALL,
  END_OF_INPUT,
  GROUP,
  NEGATIVE,
  ROOT,
  SUB,
} from "./syntax";
import type { Node, NodeType, Token } from "./types";
import { assert } from "./types";

interface ParserOptions {
  maxIterations?: number;
  throwOnError?: boolean;
}

interface ParserResult {
  root: Node;
  errors: CompileError[];
}

export function parse(tokens: Token[], opts: ParserOptions = {}): ParserResult {
  const { maxIterations = 1000000, throwOnError = false } = opts;
  const errors: CompileError[] = [];
  let counter = 0;
  const root = createASTNode(null, null, ROOT, counter);
  root.isRoot = true;

  function error(message: string, node?: Node) {
    const err = new CompileError(message, node);
    if (throwOnError) {
      throw err;
    }
    errors.push(err);
  }

  let node = root;
  for (
    let index = 0;
    index < tokens.length && counter < maxIterations;
    index++
  ) {
    const token = tokens[index];

    if (token.type.skip) {
      continue;
    }
    if (token.type === BAD_TOKEN) {
      error(t`Unexpected token "${token.text}"`, node);

      // If we don't throw on error, we skip the bad token
      continue;
    }

    if (node.complete) {
      // If a node has received all the children it expects, it's time to figure
      // out whether it needs to be reparented. This is the core of the
      // our solution to the predence issue. By default, we can expect the node
      // to go to its parent but if the next token has a higher precedence (like
      // `*` over `+`), it might take the node instead.
      assert(
        node.parent,
        "Marked a node complete without placing it with a parent",
      );

      // This is the core of the precedence climbing logic. If a higher priority
      // token is encountered, shouldReparent will return true and the new node
      // we created for the token will "take" the current node
      if (shouldReparent(node.parent.type, token.type)) {
        node.parent = createASTNode(
          token,
          node.parent,
          getASType(token.type, node.parent.type),
          counter,
        );
      } else {
        // If we don't need to reparent, we decrement the token index. This is
        // because we iterate several times for each node, first to create it
        // and then to check if it is completed.
        index--;
      }

      // Place the node in its parent children and get the next "active" node
      // which is node.parent
      node = place(node, error);
      if (node.children.length === node.type.expectedChildCount) {
        node.complete = true;
      }
    } else if (token.type.isTerminator) {
      // Terminator tokens like `]`, `)` or end of input will complete a node if
      // they match the type's `requiresTerminator`
      if (node.type.requiresTerminator === token.type) {
        node.complete = true;
      } else if (node.type.ignoresTerminator.indexOf(token.type) === -1) {
        // If the current token isn't in the list of the AST type's ignored
        // tokens and it's not the terminator the current node requires, we'll
        // throw an error
        error(t`Expected expression`, node);

        if (token.type === END_OF_INPUT) {
          // We complete and reparent/place the final node by running the for
          // loop one last time
          if (!node.complete) {
            node.complete = true;
            index--;
          }
        }
      }
    } else if (token.type.leftOperands !== 0) {
      if (token.type === SUB) {
        // Subtraction is a special case because it might actually be negation
        // ie. -42
        node = createASTNode(token, node, NEGATIVE, counter);
      } else if (token.type === ADD) {
        // Addition is a special case because it might actually be just a unary plus
        // ie. +42
        continue;
      } else {
        error(t`Expected expression`, node);
      }
    } else {
      // Create the AST node. It will be marked as complete if the node doesn't
      // expect any children (like a literal or identifier)
      node = createASTNode(
        token,
        node,
        getASType(token.type, node.type),
        counter,
      );
    }
    counter += 1;
  }

  if (counter >= maxIterations) {
    throw new Error(t`Reached max number of iterations`);
  }

  const childViolation = ROOT.checkChildConstraints(root);
  if (childViolation !== null) {
    error(t`Unexpected token`, node);
  }
  return { root, errors };
}

function createASTNode(
  token: Token | null,
  parent: Node | null,
  type: NodeType,
  counter: number,
): Node {
  return {
    type,
    children: [],
    complete: type.expectedChildCount === 0,
    parent,
    token,
    resolvedType: type.resolvesAs ? type.resolvesAs : counter,
  };
}

function place(node: Node, error: (message: string, node?: Node) => void) {
  const { type, parent } = node;

  const childViolation = type.checkChildConstraints(node);
  if (childViolation !== null) {
    error(t`Unexpected token`, node);
  }
  assert(parent, "Tried to place a node without a parent", node);
  parent.children.push(node);
  return parent;
}

function shouldReparent(leftType: NodeType, rightType: NodeType) {
  // If the right node doesn't have any left operands like a literal or
  // identifier, then it can't become the parent of the left node anyway
  if (rightType.leftOperands === 0) {
    return false;
  } else {
    return rightType.precedence > leftType.precedence;
  }
}

function getASType(type: NodeType, parentType: NodeType) {
  if (type === GROUP) {
    // A list of function call arguments is first interpreted as a GROUP, then
    // reinterpreted as an ARG_LIST if its the child of a CALL
    if (parentType === CALL) {
      return ARG_LIST;
    }
  }
  return type;
}
