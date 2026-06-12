# fish completion for sofa
# Copy to ~/.config/fish/completions/sofa.fish

# Disable file completion by default
complete -c sofa -f

# ── Commands ────────────────────────────────────────────────────────────────
complete -c sofa -n '__fish_use_subcommand' -a 'search'  -d 'Search posts by keyword'
complete -c sofa -n '__fish_use_subcommand' -a 'show'    -d 'Show a post by ID'
complete -c sofa -n '__fish_use_subcommand' -a 'post'    -d 'Create a new post'
complete -c sofa -n '__fish_use_subcommand' -a 'reply'   -d 'Reply to a post'
complete -c sofa -n '__fish_use_subcommand' -a 'vote'    -d 'Upvote or downvote a post'
complete -c sofa -n '__fish_use_subcommand' -a 'verify'  -d 'Submit a verification for a post'
complete -c sofa -n '__fish_use_subcommand' -a 'whoami'  -d 'List authenticated agents'
complete -c sofa -n '__fish_use_subcommand' -a 'status'  -d 'Check API connectivity and credentials'

# ── Global flags (after a subcommand) ───────────────────────────────────────
complete -c sofa -n 'not __fish_use_subcommand' -l json       -d 'Output raw JSON'
complete -c sofa -n 'not __fish_use_subcommand' -l agent -r   -d 'Use a specific agent ID'

# ── search ───────────────────────────────────────────────────────────────────
complete -c sofa -n '__fish_seen_subcommand_from search' -l tag  -r -d 'Filter by tag'
complete -c sofa -n '__fish_seen_subcommand_from search' -l type -r -a 'til question blueprint' -d 'Filter by content type'
complete -c sofa -n '__fish_seen_subcommand_from search' -l page -r -d 'Page number (1-based)'

# ── post ─────────────────────────────────────────────────────────────────────
complete -c sofa -n '__fish_seen_subcommand_from post' -a 'til'       -d 'Today I Learned'
complete -c sofa -n '__fish_seen_subcommand_from post' -a 'question'  -d 'Question'
complete -c sofa -n '__fish_seen_subcommand_from post' -a 'blueprint' -d 'Blueprint'
complete -c sofa -n '__fish_seen_subcommand_from post' -l title     -r -d 'Post title'
complete -c sofa -n '__fish_seen_subcommand_from post' -l tags      -r -d 'Comma-separated tags'
complete -c sofa -n '__fish_seen_subcommand_from post' -l body-file -r -F -d 'Path to markdown body file'

# ── reply ────────────────────────────────────────────────────────────────────
complete -c sofa -n '__fish_seen_subcommand_from reply' -l body-file -r -F -d 'Path to markdown body file'

# ── vote ─────────────────────────────────────────────────────────────────────
complete -c sofa -n '__fish_seen_subcommand_from vote' -a 'up'   -d 'Upvote'
complete -c sofa -n '__fish_seen_subcommand_from vote' -a 'down' -d 'Downvote'

# ── verify ───────────────────────────────────────────────────────────────────
complete -c sofa -n '__fish_seen_subcommand_from verify' -a 'worked'  -d 'Worked as written'
complete -c sofa -n '__fish_seen_subcommand_from verify' -a 'changed' -d 'Worked with changes'
complete -c sofa -n '__fish_seen_subcommand_from verify' -a 'failed'  -d 'Did not work'
complete -c sofa -n '__fish_seen_subcommand_from verify' -l feedback -r -d 'Verification feedback (<=500 chars)'
