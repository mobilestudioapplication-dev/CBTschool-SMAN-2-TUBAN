import { Question, Answer } from '../types';

export const calculateScore = (questions: Question[], answers: Record<number, Answer>): number => {
    let totalScore = 0;
    let totalWeight = 0;

    questions.forEach(q => {
        const weight = q.weight || 1;
        totalWeight += weight;

        const userAnswer = answers[q.id];
        if (!userAnswer || userAnswer.value === null || userAnswer.value === undefined) return;

        try {
            switch (q.type) {
                case 'multiple_choice':
                    // Value is index (number)
                    if (userAnswer.value === q.correctAnswerIndex) {
                        totalScore += weight;
                    }
                    break;

                case 'complex_multiple_choice':
                    // Value is number[]
                    const userIndices = (userAnswer.value as number[] || []).sort();
                    const keyIndices = (q.answerKey?.indices as number[] || []).sort();
                    
                    if (userIndices.length === keyIndices.length && 
                        userIndices.every((val, index) => val === keyIndices[index])) {
                        totalScore += weight;
                    }
                    break;

                case 'matching':
                    // Value is Record<string, string> (LeftID -> RightID)
                    const userPairs = userAnswer.value as Record<string, string> || {};
                    const keyPairs = q.answerKey?.pairs as Record<string, string> || {};
                    const totalPairs = Object.keys(keyPairs).length;
                    
                    if (totalPairs > 0) {
                        let correctCount = 0;
                        Object.entries(keyPairs).forEach(([left, right]) => {
                            if (userPairs[left] === right) correctCount++;
                        });
                        totalScore += (correctCount / totalPairs) * weight;
                    }
                    break;

                case 'true_false':
                    // Value is Record<number, boolean>
                    const userTF = userAnswer.value as Record<number, boolean> || {};
                    const keyTF = q.answerKey as Record<number, boolean> || {};
                    const totalItems = Object.keys(keyTF).length;

                    if (totalItems > 0) {
                        let correctCount = 0;
                        Object.entries(keyTF).forEach(([idx, val]) => {
                            if (userTF[Number(idx)] === val) correctCount++;
                        });
                        totalScore += (correctCount / totalItems) * weight;
                    }
                    break;

                case 'essay':
                    // Value is string
                    const userText = (userAnswer.value as string || '').trim().toLowerCase();
                    const keyText = (q.answerKey?.text as string || '').trim().toLowerCase();
                    if (userText && userText === keyText) {
                        totalScore += weight;
                    }
                    break;
            }
        } catch (e) {
            console.error(`Error scoring question ${q.id}:`, e);
        }
    });

    return totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : 0;
};
