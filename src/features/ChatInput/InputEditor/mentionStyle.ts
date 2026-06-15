import { css, cx } from 'antd-style';

// Override the default outlined chip style from `@lobehub/editor`'s mention
// plugin so @-mentions render as a flat filled chip, matching the look of
// other inline references (ActionMention, ReferTopic) in the chat UI.
export const mentionFilledClassName = cx(css`
  .editor_mention,
  .editor_mention[class],
  .editor_mention.selected,
  .editor_mention:focus,
  .editor_mention:focus-visible {
    border: 0;
    outline: none;
    box-shadow: none;
  }
`);
