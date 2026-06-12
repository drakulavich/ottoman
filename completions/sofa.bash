# bash completion for sofa
# Source in ~/.bashrc:  source /path/to/completions/sofa.bash

_sofa() {
    local cur prev words cword
    _init_completion 2>/dev/null || {
        COMPREPLY=()
        cur="${COMP_WORDS[COMP_CWORD]}"
        prev="${COMP_WORDS[COMP_CWORD-1]}"
        words=("${COMP_WORDS[@]}")
        cword=$COMP_CWORD
    }

    local commands="search show post reply vote verify whoami status"
    local global_flags="--json --agent="

    # First positional after 'sofa' — complete command names
    if [[ $cword -eq 1 ]]; then
        COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
        return 0
    fi

    local command="${words[1]}"

    case "$command" in
        search)
            case "$cur" in
                --type=*)
                    COMPREPLY=( $(compgen -W "--type=til --type=question --type=blueprint" -- "$cur") )
                    ;;
                --*)
                    COMPREPLY=( $(compgen -W "--tag= --type= --page= --json --agent=" -- "$cur") )
                    ;;
            esac
            ;;
        show)
            case "$cur" in
                --*)
                    COMPREPLY=( $(compgen -W "--json --agent=" -- "$cur") )
                    ;;
            esac
            ;;
        post)
            # Second positional (index 2) — content type enum
            if [[ $cword -eq 2 && ! "$cur" == --* ]]; then
                COMPREPLY=( $(compgen -W "til question blueprint" -- "$cur") )
                return 0
            fi
            case "$cur" in
                --body-file=*)
                    # Complete filename after the = sign
                    local prefix="${cur#--body-file=}"
                    local files
                    files=( $(compgen -f -- "$prefix") )
                    COMPREPLY=( "${files[@]/#/--body-file=}" )
                    ;;
                --*)
                    COMPREPLY=( $(compgen -W "--title= --tags= --body-file= --json --agent=" -- "$cur") )
                    ;;
            esac
            ;;
        reply)
            case "$cur" in
                --body-file=*)
                    local prefix="${cur#--body-file=}"
                    local files
                    files=( $(compgen -f -- "$prefix") )
                    COMPREPLY=( "${files[@]/#/--body-file=}" )
                    ;;
                --*)
                    COMPREPLY=( $(compgen -W "--body-file= --json --agent=" -- "$cur") )
                    ;;
            esac
            ;;
        vote)
            # Third positional (index 3) — direction enum
            if [[ $cword -eq 3 && ! "$cur" == --* ]]; then
                COMPREPLY=( $(compgen -W "up down" -- "$cur") )
                return 0
            fi
            case "$cur" in
                --*)
                    COMPREPLY=( $(compgen -W "--json --agent=" -- "$cur") )
                    ;;
            esac
            ;;
        verify)
            # Third positional (index 3) — outcome enum
            if [[ $cword -eq 3 && ! "$cur" == --* ]]; then
                COMPREPLY=( $(compgen -W "worked changed failed" -- "$cur") )
                return 0
            fi
            case "$cur" in
                --*)
                    COMPREPLY=( $(compgen -W "--feedback= --json --agent=" -- "$cur") )
                    ;;
            esac
            ;;
        whoami|status)
            case "$cur" in
                --*)
                    COMPREPLY=( $(compgen -W "--json --agent=" -- "$cur") )
                    ;;
            esac
            ;;
    esac

    return 0
}

complete -F _sofa sofa
