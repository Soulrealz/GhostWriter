import { generateText } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import 'dotenv/config';

async function main() {
	const google = createGoogleGenerativeAI();

	const result = await generateText({
		model: google('gemini-2.5-flash'),
		system: 'You are Wisp, a coding agent.',
		messages: [{ role: 'user', content: 'Say hello from Wisp' }],
	});

	console.log(result.text);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
