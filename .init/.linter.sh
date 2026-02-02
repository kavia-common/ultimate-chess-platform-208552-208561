#!/bin/bash
cd /home/kavia/workspace/code-generation/ultimate-chess-platform-208552-208561/chess_backend
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

