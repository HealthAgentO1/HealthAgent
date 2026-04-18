from django.test import SimpleTestCase, override_settings

from api.services.symptom_llm import get_symptom_chat_system_prompt, trim_chat_messages


class TrimChatMessagesTests(SimpleTestCase):
    @override_settings(LLM_MAX_INPUT_TOKENS=500)
    def test_drops_oldest_turns_when_over_budget(self):
        long = "word " * 400
        messages = []
        for i in range(6):
            messages.append({"role": "user", "content": f"u{i} {long}"})
            messages.append({"role": "assistant", "content": f"a{i} ok"})

        trimmed = trim_chat_messages(
            get_symptom_chat_system_prompt(),
            messages,
            max_input_tokens=500,
        )
        self.assertLess(len(trimmed), len(messages))
        self.assertTrue(all(m["role"] in ("user", "assistant") for m in trimmed))
        if trimmed:
            self.assertEqual(trimmed[0]["role"], "user")
