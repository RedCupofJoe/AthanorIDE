"""AST allowlist security validator for generated transformation code."""

from __future__ import annotations

import ast
from dataclasses import dataclass

FORBIDDEN_NODE_TYPES: tuple[type[ast.AST], ...] = (
    ast.Import,
    ast.ImportFrom,
    ast.Global,
    ast.Nonlocal,
    ast.AsyncFunctionDef,
    ast.ClassDef,
    ast.With,
    ast.AsyncWith,
    ast.Try,
    ast.Raise,
    ast.Assert,
    ast.Delete,
    ast.Lambda,
    ast.ListComp,
    ast.SetComp,
    ast.DictComp,
    ast.GeneratorExp,
    ast.Yield,
    ast.YieldFrom,
    ast.Await,
    ast.While,
    ast.For,
    ast.AsyncFor,
    ast.Match,
)

FORBIDDEN_NAMES = {
    "eval",
    "exec",
    "compile",
    "open",
    "__import__",
    "getattr",
    "setattr",
    "delattr",
    "globals",
    "locals",
    "vars",
    "dir",
    "breakpoint",
    "input",
    "help",
    "exit",
    "quit",
}

ALLOWED_STR_METHODS = {
    "upper",
    "lower",
    "strip",
    "lstrip",
    "rstrip",
    "replace",
    "startswith",
    "endswith",
}


@dataclass(frozen=True)
class AstViolation:
    code: str
    message: str
    lineno: int | None = None


def validate_transform_ast(source: str) -> list[AstViolation]:
    """Return violations; empty list means the module is allowlisted."""

    try:
        tree = ast.parse(source, mode="exec")
    except SyntaxError as exc:
        return [
            AstViolation(
                code="SYNTAX_ERROR",
                message=f"Generated code has a syntax error: {exc.msg}",
                lineno=exc.lineno,
            )
        ]

    violations: list[AstViolation] = []

    for node in ast.walk(tree):
        if isinstance(node, FORBIDDEN_NODE_TYPES):
            violations.append(
                AstViolation(
                    code="FORBIDDEN_NODE",
                    message=f"Disallowed AST node: {type(node).__name__}",
                    lineno=getattr(node, "lineno", None),
                )
            )

        if isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            violations.append(
                AstViolation(
                    code="FORBIDDEN_NAME",
                    message=f"Disallowed name: {node.id}",
                    lineno=getattr(node, "lineno", None),
                )
            )

        if isinstance(node, ast.Attribute) and (
            node.attr.startswith("__") or node.attr in FORBIDDEN_NAMES
        ):
            violations.append(
                AstViolation(
                    code="FORBIDDEN_ATTR",
                    message=f"Disallowed attribute access: {node.attr}",
                    lineno=getattr(node, "lineno", None),
                )
            )

        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id in FORBIDDEN_NAMES:
                violations.append(
                    AstViolation(
                        code="FORBIDDEN_CALL",
                        message=f"Disallowed call: {func.id}()",
                        lineno=getattr(node, "lineno", None),
                    )
                )
            if isinstance(func, ast.Attribute) and func.attr not in ALLOWED_STR_METHODS:
                violations.append(
                    AstViolation(
                        code="FORBIDDEN_CALL",
                        message=f"Method not on allowlist: .{func.attr}()",
                        lineno=getattr(node, "lineno", None),
                    )
                )

    functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)]

    if len(functions) != 1 or functions[0].name != "transform":
        violations.append(
            AstViolation(
                code="FUNCTION_SHAPE",
                message="Module must define exactly one function named transform",
            )
        )
    else:
        fn = functions[0]
        if len(fn.args.args) != 1:
            violations.append(
                AstViolation(
                    code="FUNCTION_SHAPE",
                    message="transform must accept exactly one argument",
                    lineno=fn.lineno,
                )
            )

    return violations
