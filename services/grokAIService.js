const axios = require('axios');

class GrokAIService {
  constructor() {
    this.apiKey = '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';
    this.baseUrl = 'https://openrouter.ai/api/v1';
    this.model = 'x-ai/grok-4-fast:free';
  }

  async generatePrescription(patientData) {
    try {
      const { symptoms, patientName, patientAge, medicalHistory = '', allergies = '' } = patientData;

      const prompt = this.createPrescriptionPrompt(symptoms, patientName, patientAge, medicalHistory, allergies);

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are an experienced dental professional AI assistant. Generate accurate, safe, and appropriate dental prescriptions based on patient symptoms. Always prioritize patient safety and include proper warnings. Format your response as valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            },
          ],
          max_tokens: 1500,
          temperature: 0.3,
          top_p: 0.9
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://neurodent.app',
            'X-Title': 'Neurodent Dental Management System'
          }
        }
      );

      const aiResponse = response.data.choices[0].message.content;
      console.log('🤖 AI Raw Response:', aiResponse);

      // Parse the JSON response
      const prescriptionData = this.parseAIResponse(aiResponse);
      
      return {
        success: true,
        data: prescriptionData,
        aiModel: this.model,
        tokensUsed: response.data.usage?.total_tokens || 0
      };

    } catch (error) {
      console.error('❌ Grok AI Error:', error.response?.data || error.message);
      
      // Return fallback prescription if AI fails
      return this.getFallbackPrescription(patientData);
    }
  }

  createPrescriptionPrompt(symptoms, patientName, patientAge, medicalHistory, allergies) {
    return `
Generate a dental prescription for the following patient:

Patient Information:
- Name: ${patientName}
- Age: ${patientAge} years
- Symptoms: ${symptoms}
- Medical History: ${medicalHistory || 'None reported'}
- Allergies: ${allergies || 'None reported'}

Please provide a comprehensive dental prescription in the following JSON format ONLY:

{
  "diagnosis": "Primary dental diagnosis based on symptoms",
  "medications": [
    {
      "name": "Medication name with strength",
      "dosage": "How much to take",
      "duration": "How long to take it",
      "instructions": "Special instructions",
      "frequency": "How often"
    }
  ],
  "generalInstructions": "General care instructions and precautions",
  "followUpRecommendation": "Follow-up timeline (in days from now)",
  "warnings": "Important warnings or contraindications",
  "homeRemedies": "Safe home remedies to complement treatment"
}

Guidelines:
1. Focus on common dental conditions (toothache, gum inflammation, post-procedure care, etc.)
2. Recommend appropriate pain management (ibuprofen, acetaminophen)
3. Include antibiotics only if infection is suspected
4. Suggest antiseptic mouthwash for oral hygiene
5. Consider patient age for dosage recommendations
6. Include dietary restrictions if relevant
7. Provide realistic follow-up timeline
8. Always include safety warnings

Return ONLY valid JSON, no additional text or explanations.`;
  }

  parseAIResponse(aiResponse) {
    try {
      // Clean the response to extract JSON
      let cleanResponse = aiResponse.trim();
      
      // Remove any markdown formatting
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Find JSON object in the response
      const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[0];
      }

      const prescriptionData = JSON.parse(cleanResponse);

      // Validate and structure the response
      return {
        diagnosis: prescriptionData.diagnosis || 'Dental consultation required',
        medications: this.validateMedications(prescriptionData.medications || []),
        generalInstructions: prescriptionData.generalInstructions || 'Follow standard dental care practices.',
        followUpDays: this.parseFollowUpDays(prescriptionData.followUpRecommendation),
        warnings: prescriptionData.warnings || 'Consult dentist if symptoms persist.',
        homeRemedies: prescriptionData.homeRemedies || 'Maintain good oral hygiene.'
      };

    } catch (error) {
      console.error('❌ Error parsing AI response:', error);
      throw new Error('Failed to parse AI prescription response');
    }
  }

  validateMedications(medications) {
    return medications.map(med => ({
      name: med.name || 'Medication name not specified',
      dosage: med.dosage || 'As directed',
      duration: med.duration || '3-5 days',
      instructions: med.instructions || 'Take as prescribed',
      frequency: med.frequency || 'As needed'
    })).slice(0, 5); // Limit to 5 medications for safety
  }

  parseFollowUpDays(followUpText) {
    if (!followUpText) return 7;
    
    const daysMatch = followUpText.match(/(\d+)\s*days?/i);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      return Math.min(Math.max(days, 1), 30); // Between 1-30 days
    }
    
    const weekMatch = followUpText.match(/(\d+)\s*weeks?/i);
    if (weekMatch) {
      const weeks = parseInt(weekMatch[1]);
      return Math.min(weeks * 7, 30);
    }
    
    return 7; // Default 1 week
  }

  getFallbackPrescription(patientData) {
    const { symptoms } = patientData;
    
    // Simple keyword-based fallback
    let diagnosis = 'Dental discomfort';
    let medications = [
      {
        name: 'Ibuprofen 400mg',
        dosage: '1 tablet',
        duration: '3-5 days',
        instructions: 'Take with food',
        frequency: 'Every 6-8 hours as needed'
      }
    ];

    if (symptoms.toLowerCase().includes('pain') || symptoms.toLowerCase().includes('ache')) {
      diagnosis = 'Dental pain management';
      medications.push({
        name: 'Acetaminophen 500mg',
        dosage: '1-2 tablets',
        duration: '3-5 days',
        instructions: 'Can be taken with ibuprofen',
        frequency: 'Every 4-6 hours as needed'
      });
    }

    if (symptoms.toLowerCase().includes('gum') || symptoms.toLowerCase().includes('bleeding')) {
      diagnosis = 'Gum inflammation';
      medications.push({
        name: 'Chlorhexidine Mouthwash 0.12%',
        dosage: '10ml',
        duration: '7 days',
        instructions: 'Rinse for 30 seconds, do not swallow',
        frequency: 'Twice daily after brushing'
      });
    }

    return {
      success: true,
      data: {
        diagnosis,
        medications,
        generalInstructions: 'Maintain good oral hygiene. Avoid hard foods. Apply cold compress for swelling.',
        followUpDays: 7,
        warnings: 'Contact dentist if symptoms worsen or persist beyond 3 days.',
        homeRemedies: 'Salt water rinse, avoid hot/cold foods, use soft toothbrush.'
      },
      aiModel: 'fallback',
      tokensUsed: 0
    };
  }
}

module.exports = new GrokAIService();