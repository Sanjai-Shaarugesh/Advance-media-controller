#!/bin/bash

set -e

EXTENSION_NAME="advanced-media-controller"
LOCALE_DIR="locale"
POT_FILE="$LOCALE_DIR/$EXTENSION_NAME.pot"

SUPPORTED_LANGUAGES=("es" "fr" "de" "ja" "zh_CN" "zh_TW")

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Advanced Media Controller Translation Builder${NC}"
echo "=============================================="

if ! command -v msgfmt &> /dev/null; then
    echo -e "${RED}Error: msgfmt not found. Please install gettext:${NC}"
    echo "  Debian/Ubuntu: sudo apt install gettext"
    echo "  Fedora: sudo dnf install gettext"
    echo "  Arch: sudo pacman -S gettext"
    exit 1
fi

extract_strings() {
    echo -e "\n${YELLOW}Extracting translatable strings...${NC}"
    
    mkdir -p "$LOCALE_DIR"
    
    xgettext --from-code=UTF-8 \
             --keyword=_ \
             --keyword=_n:1,2 \
             --package-name="$EXTENSION_NAME" \
             --package-version="1.0" \
             --msgid-bugs-address="https://github.com/Sanjai-Shaarugesh/Advance-media-controller/issues" \
             --output="$POT_FILE" \
             *.js utils/*.js utils/*/*.js 2>/dev/null || true
    
    if [ -f "$POT_FILE" ]; then
        echo -e "${GREEN}✓${NC} Template file created: $POT_FILE"
    else
        echo -e "${YELLOW}Note: No template file created (may not have extractable strings)${NC}"
    fi
}

compile_translation() {
    local lang=$1
    local po_file="$LOCALE_DIR/$lang/LC_MESSAGES/$EXTENSION_NAME.po"
    local mo_file="$LOCALE_DIR/$lang/LC_MESSAGES/$EXTENSION_NAME.mo"
    
    if [ ! -f "$po_file" ]; then
        echo -e "${RED}✗${NC} $lang: .po file not found"
        return 1
    fi
    
    if msgfmt -c "$po_file" -o /dev/null 2>&1; then
        msgfmt "$po_file" -o "$mo_file"
        local stats=$(msgfmt --statistics "$po_file" 2>&1)
        echo -e "${GREEN}✓${NC} $lang: Compiled successfully"
        echo "  └─ $stats"
        return 0
    else
        echo -e "${RED}✗${NC} $lang: Compilation failed"
        msgfmt -c "$po_file" -o /dev/null
        return 1
    fi
}

compile_all() {
    echo -e "\n${YELLOW}Compiling all translations...${NC}"
    
    local success=0
    local failed=0
    
    for lang in "${SUPPORTED_LANGUAGES[@]}"; do
        if [ -f "$LOCALE_DIR/$lang/LC_MESSAGES/$EXTENSION_NAME.po" ]; then
            if compile_translation "$lang"; then
                ((success++))
            else
                ((failed++))
            fi
        else
            echo -e "${YELLOW}⊘${NC} $lang: Translation not found, skipping"
        fi
    done
    
    for po_file in "$LOCALE_DIR"/*/LC_MESSAGES/*.po; do
        if [ -f "$po_file" ]; then
            local lang=$(basename $(dirname $(dirname "$po_file")))
            
            local already_compiled=false
            for supported_lang in "${SUPPORTED_LANGUAGES[@]}"; do
                if [ "$lang" = "$supported_lang" ]; then
                    already_compiled=true
                    break
                fi
            done
            
            if [ "$already_compiled" = false ]; then
                if compile_translation "$lang"; then
                    ((success++))
                else
                    ((failed++))
                fi
            fi
        fi
    done
    
    echo -e "\n${GREEN}Summary:${NC}"
    echo "  Successful: $success"
    if [ $failed -gt 0 ]; then
        echo -e "  ${RED}Failed: $failed${NC}"
        return 1
    fi
    return 0
}

compile_defaults() {
    echo -e "\n${YELLOW}Compiling default translations...${NC}"
    
    cd "$LOCALE_DIR" || exit 1
    
    for lang in "${SUPPORTED_LANGUAGES[@]}"; do
        if [ -f "$lang/LC_MESSAGES/$EXTENSION_NAME.po" ]; then
            echo -e "${YELLOW}Compiling $lang...${NC}"
            msgfmt "$lang/LC_MESSAGES/$EXTENSION_NAME.po" \
                   -o "$lang/LC_MESSAGES/$EXTENSION_NAME.mo" 2>&1
            
            if [ $? -eq 0 ]; then
                echo -e "${GREEN}✓${NC} $lang compiled"
            else
                echo -e "${RED}✗${NC} $lang compilation failed"
            fi
        else
            echo -e "${YELLOW}⊘${NC} $lang: Translation file not found"
        fi
    done
    
    cd - > /dev/null
}

update_translation() {
    local lang=$1
    local po_file="$LOCALE_DIR/$lang/LC_MESSAGES/$EXTENSION_NAME.po"
    
    if [ ! -f "$POT_FILE" ]; then
        echo -e "${RED}Error: Template file not found. Run with --extract first.${NC}"
        return 1
    fi
    
    if [ ! -f "$po_file" ]; then
        echo -e "${YELLOW}Creating new translation file for $lang${NC}"
        mkdir -p "$LOCALE_DIR/$lang/LC_MESSAGES"
        msginit --input="$POT_FILE" \
                --output-file="$po_file" \
                --locale="$lang" \
                --no-translator
    else
        echo -e "${YELLOW}Updating $lang from template${NC}"
        msgmerge --update "$po_file" "$POT_FILE"
    fi
    
    echo -e "${GREEN}✓${NC} $lang: Updated"
}

list_translations() {
    echo -e "\n${YELLOW}Available translations:${NC}"
    
    for lang_dir in "$LOCALE_DIR"/*/; do
        if [ -d "$lang_dir" ]; then
            local lang=$(basename "$lang_dir")
            local po_file="$lang_dir/LC_MESSAGES/$EXTENSION_NAME.po"
            local mo_file="$lang_dir/LC_MESSAGES/$EXTENSION_NAME.mo"
            
            if [ -f "$po_file" ]; then
                local compiled=""
                if [ -f "$mo_file" ]; then
                    if [ "$mo_file" -nt "$po_file" ]; then
                        compiled="${GREEN}[compiled]${NC}"
                    else
                        compiled="${YELLOW}[needs recompile]${NC}"
                    fi
                else
                    compiled="${RED}[not compiled]${NC}"
                fi
                
                local stats=$(msgfmt --statistics "$po_file" 2>&1 | head -n1)
                echo -e "  $lang $compiled"
                echo "    └─ $stats"
            fi
        fi
    done
}

create_translation() {
    local lang=$1
    
    if [ -z "$lang" ]; then
        echo -e "${RED}Error: Language code required${NC}"
        echo "Usage: $0 --create LANG_CODE"
        echo "Example: $0 --create pt_BR"
        return 1
    fi
    
    local lang_dir="$LOCALE_DIR/$lang/LC_MESSAGES"
    local po_file="$lang_dir/$EXTENSION_NAME.po"
    
    if [ -f "$po_file" ]; then
        echo -e "${RED}Error: Translation for $lang already exists${NC}"
        return 1
    fi
    
    if [ ! -f "$POT_FILE" ]; then
        echo -e "${YELLOW}Template not found. Extracting strings first...${NC}"
        extract_strings
    fi
    
    echo -e "${YELLOW}Creating new translation for $lang...${NC}"
    mkdir -p "$lang_dir"
    
    msginit --input="$POT_FILE" \
            --output-file="$po_file" \
            --locale="$lang" \
            --no-translator
    
    echo -e "${GREEN}✓${NC} Translation file created: $po_file"
    echo ""
    echo "Next steps:"
    echo "  1. Edit $po_file and translate the strings"
    echo "  2. Run: $0 --compile $lang"
    echo "  3. Test the translation"
}

clean_backups() {
    echo -e "\n${YELLOW}Cleaning backup files...${NC}"
    
    local count=$(find "$LOCALE_DIR" -name "*.po~" | wc -l)
    
    if [ $count -gt 0 ]; then
        find "$LOCALE_DIR" -name "*.po~" -delete
        echo -e "${GREEN}✓${NC} Removed $count backup file(s)"
    else
        echo -e "${GREEN}✓${NC} No backup files found"
    fi
}

show_help() {
    cat << EOF
Advanced Media Controller Translation Builder

Usage: $0 [OPTION]

Options:
  --extract              Extract translatable strings to template
  --compile [LANG]       Compile translation(s) to binary format
                         If LANG is specified, compile only that language
                         If omitted, compile all languages
  --compile-defaults     Compile all default supported languages
  --update [LANG]        Update translation from template
  --create LANG          Create new translation for language code
  --list                 List all available translations
  --clean                Remove backup files (*.po~)
  --all                  Extract strings, update all, and compile all
  --help                 Show this help message

Supported Languages:
  es        Spanish
  fr        French
  de        German
  ja        Japanese
  zh_CN     Chinese (Simplified)
  zh_TW     Chinese (Traditional)

Examples:
  $0 --extract                # Extract strings to template
  $0 --compile                # Compile all translations
  $0 --compile-defaults       # Compile only default languages
  $0 --compile es             # Compile only Spanish
  $0 --update fr              # Update French from template
  $0 --create pt_BR           # Create new Portuguese (Brazil) translation
  $0 --list                   # List all translations and status
  $0 --clean                  # Remove backup files
  $0 --all                    # Do everything (extract, update, compile)

Additional language codes:
  pt        Portuguese
  pt_BR     Portuguese (Brazil)
  it        Italian
  ko        Korean
  ru        Russian
  ar        Arabic
  hi        Hindi
  nl        Dutch
  pl        Polish
  tr        Turkish

EOF
}

case "${1:-}" in
    --extract)
        extract_strings
        ;;
    --compile)
        if [ -n "$2" ]; then
            compile_translation "$2"
        else
            compile_all
        fi
        ;;
    --compile-defaults)
        compile_defaults
        ;;
    --update)
        if [ -n "$2" ]; then
            update_translation "$2"
        else
            echo -e "${RED}Error: Language code required${NC}"
            echo "Usage: $0 --update LANG_CODE"
            exit 1
        fi
        ;;
    --create)
        create_translation "$2"
        ;;
    --list)
        list_translations
        ;;
    --clean)
        clean_backups
        ;;
    --all)
        extract_strings
        echo -e "\n${YELLOW}Updating all translations...${NC}"
        for lang in "${SUPPORTED_LANGUAGES[@]}"; do
            if [ -f "$LOCALE_DIR/$lang/LC_MESSAGES/$EXTENSION_NAME.po" ]; then
                update_translation "$lang"
            fi
        done
        compile_all
        clean_backups
        ;;
    --help|"")
        show_help
        ;;
    *)
        echo -e "${RED}Error: Unknown option: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac

exit 0