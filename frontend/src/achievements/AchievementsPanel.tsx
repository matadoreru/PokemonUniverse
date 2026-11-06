import type { AchievementsResponse } from '../lib/api-contract';
import { AchievementTile } from '../ui';
import { achievementArt } from './achievement-art';
import { groupAchievements, unlockedDate } from './achievements-groups';

/** Los logros de la cuenta en tres grupos; el secreto bloqueado llega ya con su texto de relleno desde el servidor. */
export function AchievementsPanel({ data }: { data: AchievementsResponse }) {
  return (
    <div className="flex flex-col gap-5">
      {groupAchievements(data.achievements).map((group) => (
        <section key={group.key} aria-labelledby={`logros-grupo-${group.key}`} className="flex flex-col gap-3">
          <h3 id={`logros-grupo-${group.key}`} className="font-display text-22 font-extrabold">{group.title}</h3>
          <ul className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-2 2xl:grid-cols-3">
            {group.items.map((achievement) => {
              const state = achievement.unlockedAt ? 'unlocked' : achievement.family === 'SECRET' ? 'secret' : 'locked';
              return (
                <AchievementTile
                  key={achievement.id}
                  name={achievement.name}
                  description={achievement.description}
                  state={state}
                  art={achievementArt(achievement)}
                  {...(achievement.unlockedAt ? { date: unlockedDate(achievement.unlockedAt) } : {})}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
