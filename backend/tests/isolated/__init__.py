"""Tests that build their own throwaway schema.

They do not use the `tests/integration` harness (whose conftest skips the whole
package when it cannot reach the shared test database) because each test here
creates, populates and drops a schema of its own.
"""
