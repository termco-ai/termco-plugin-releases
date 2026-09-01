# termco-shell-integration (zprofile)
#
# See zshenv.zsh for the rationale on the trailing `:`.
{
  _termco_user_zdotdir="${TERMCO_USER_ZDOTDIR:-$HOME}"
  [ -f "$_termco_user_zdotdir/.zprofile" ] && source "$_termco_user_zdotdir/.zprofile"
  unset _termco_user_zdotdir
}
:
