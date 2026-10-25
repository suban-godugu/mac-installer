import type { Db } from '../db'
import { ProfilesRepo } from './profiles'
import { SettingsRepo } from './settings'
import { TasksRepo } from './tasks'
import { ResearchRepo } from './research'

export interface Repos {
  profiles: ProfilesRepo
  settings: SettingsRepo
  tasks: TasksRepo
  research: ResearchRepo
}

export function createRepos(db: Db): Repos {
  return {
    profiles: new ProfilesRepo(db),
    settings: new SettingsRepo(db),
    tasks: new TasksRepo(db),
    research: new ResearchRepo(db)
  }
}

export { ProfilesRepo, SettingsRepo, TasksRepo, ResearchRepo }
