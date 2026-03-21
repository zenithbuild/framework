#!/bin/bash
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
	start.bat
else
	bash start.sh
fi
