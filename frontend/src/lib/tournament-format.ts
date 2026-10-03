import type { TournamentFormat } from '@/types/api'

export interface FormatMeta {
  howItWorks: string
  standings: string
}

export const formatMeta: Record<TournamentFormat, FormatMeta> = {
  GROUP_KNOCKOUT: {
    howItWorks:
      'Players are split into groups and play round-robin within their group — everyone faces every other player in their group once. The top finishers from each group then advance to a single-elimination knockout bracket, which decides the champion.',
    standings:
      "Group standings rank players by match points (1 per win), then tiebreakers in order: head-to-head result, game difference, rally point difference, and finally seed. The knockout bracket is single-elimination — there's no ongoing table there, since losing a match means elimination.",
  },
  SWISS_KNOCKOUT: {
    howItWorks:
      "Players are paired each round based on their current record — similar records face off, and no two players meet twice. After a fixed number of Swiss rounds, the top performers advance to a knockout bracket to decide the champion.",
    standings:
      'Swiss standings rank players by match points, then tiebreakers in order: Buchholz score (the sum of your opponents\' match points, rewarding a tougher schedule), Sonneborn-Berger score (the same idea, counting only opponents you beat), game difference, and seed.',
  },
  TEAM_FRIENDLY: {
    howItWorks:
      "The roster is split into two teams. Every player plays the same number of singles matches against players from the other team — never a teammate — making this a casual, mixer-style format rather than a bracket.",
    standings:
      "Individual standings rank players by matches won, then game difference and rally point difference. Team standings simply total each team's match wins across all of its players — whichever team's players collectively win more matches is ahead.",
  },
}
