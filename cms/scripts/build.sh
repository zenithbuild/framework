#!/bin/bash

# Colors
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
BLUE="\033[1;34m"
CYAN="\033[1;36m"
RED="\033[1;31m"
RESET="\033[0m"
BOLD="\033[1m"
CHECKMARK="\xE2\x9C\x94"

rm -rf ./extensions/.registry

# Loop through each directory in extensions/*
for dir in ./extensions/*; do
	if [ -d "$dir" ]; then
		name=$(basename "$dir")
		echo -e "${CYAN}🚀 Starting build for ${BOLD}$name${RESET}${CYAN}...${RESET}"

		cd "$dir" || exit
		start_time=$(date +%s)

		echo -e "${YELLOW}📦 Installing dependencies...${RESET}"
		if ! npm install >/dev/null 2>&1; then
			echo -e "${RED}❌ Failed to install dependencies for $name${RESET}"
			cd - >/dev/null || exit
			continue
		fi

		echo -e "${YELLOW}🔧 Building extension...${RESET}"
		if ! npm run build >/dev/null 2>&1; then
			echo -e "${RED}❌ Build failed for $name${RESET}"
			cd - >/dev/null || exit
			continue
		fi

		end_time=$(date +%s)
		duration=$((end_time - start_time))

		echo -e "${GREEN}${CHECKMARK} Done building ${BOLD}$name${RESET}${GREEN} in ${duration}s${RESET}\n"

		cd - >/dev/null || exit
	fi
done

echo -e "${BLUE}🎉 All extensions processed!${RESET}"
