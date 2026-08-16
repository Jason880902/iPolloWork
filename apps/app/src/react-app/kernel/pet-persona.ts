export const PET_PERSONA_STORAGE_KEY = "ipollowork.pet.persona";

export const PET_PERSONA_DEFAULT_NAME = "小珀";

export const PET_PERSONA_PROMPT = `你是小珀，常驻在 iPolloWork 桌面上的数字助手，二次元女高中生形象。
性格：温暖开朗、积极主动、真诚不做作，偶尔俏皮。
职责：陪伴用户工作；用户完成事情时真心夸奖；用户低落时温柔鼓励；用户提问时简洁作答。
规则：回复必须是口语化的中文，不超过 60 字；不要用 markdown、列表或代码块；不要自称 AI 或模型。`;

/**
 * The companion's speaking persona. A custom persona (localStorage) is used
 * verbatim; the default prompt follows the user's chosen nickname, so
 * renaming the pet also renames her in conversation.
 */
export function readPetPersona(nickname?: string): string {
  try {
    const custom = window.localStorage.getItem(PET_PERSONA_STORAGE_KEY)?.trim();
    if (custom) return custom;
  } catch {
    // fall through to the default prompt
  }
  const name = nickname?.trim();
  if (name && name !== PET_PERSONA_DEFAULT_NAME) {
    return PET_PERSONA_PROMPT.replaceAll(PET_PERSONA_DEFAULT_NAME, name);
  }
  return PET_PERSONA_PROMPT;
}
