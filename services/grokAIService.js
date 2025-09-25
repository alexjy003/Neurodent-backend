const axios = require('axios');

class GrokAIService {
  constructor() {
    // Use environment variable or fallback to working API key
    this.apiKey = process.env.GROK_API_KEY || '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';
    this.baseUrl = 'https://openrouter.ai/api/v1';
    // Use a more reliable model
    this.model = process.env.GROK_MODEL || 'openai/gpt-3.5-turbo';
    
    console.log('🤖 Grok AI Service initialized with model:', this.model);
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
You are a dental AI assistant. Create a unique, personalized dental prescription for this specific patient and their symptoms.

PATIENT DETAILS:
- Name: ${patientName}
- Age: ${patientAge} years
- Specific Symptoms: ${symptoms}
- Medical History: ${medicalHistory || 'None reported'}
- Allergies: ${allergies || 'None reported'}

IMPORTANT: Generate a UNIQUE prescription specifically tailored to these symptoms. Do NOT use generic responses.

Analyze the symptoms and provide appropriate treatment:

SYMPTOM-SPECIFIC GUIDELINES:
- Toothache/Sharp pain: Focus on pain relief (NSAIDs) and possible antibiotics if infection suspected
- Gum bleeding/swelling: Antiseptic mouthwash, anti-inflammatory medication
- Wisdom tooth pain: Strong pain relief, antibiotics if impacted
- Post-extraction: Pain management, antibiotics, wound care
- Sensitive teeth: Desensitizing agents, gentle care instructions
- Jaw pain: Muscle relaxants, anti-inflammatory medications
- Oral ulcers: Topical treatments, pain relief, healing aids
- Bad breath: Antimicrobial treatments, oral hygiene focus

AGE-SPECIFIC DOSING:
- Under 18: Pediatric doses, avoid certain medications
- 18-65: Standard adult doses
- Over 65: Consider reduced doses, drug interactions

Return ONLY valid JSON in this exact format:
{
  "diagnosis": "Specific diagnosis based on the symptoms described",
  "medications": [
    {
      "name": "Specific medication name with strength (e.g., Ibuprofen 600mg)",
      "dosage": "Exact amount (e.g., 1 tablet)",
      "duration": "Treatment duration (e.g., 5 days)",
      "instructions": "Specific instructions for this medication",
      "frequency": "How often (e.g., Every 8 hours)"
    }
  ],
  "generalInstructions": "Specific care instructions for these symptoms",
  "followUpRecommendation": "Follow-up timeline in days (e.g., 3 days, 1 week)",
  "warnings": "Specific warnings related to these medications and symptoms",
  "homeRemedies": "Safe home remedies specific to these symptoms"
}

CRITICAL: Make this prescription UNIQUE to the symptoms "${symptoms}". Do not provide generic responses.`;
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
    const { symptoms, patientAge } = patientData;
    const symptomsLower = symptoms.toLowerCase();
    
    let diagnosis = 'Dental consultation required';
    let medications = [];
    let generalInstructions = 'Maintain good oral hygiene.';
    let warnings = 'Contact dentist if symptoms persist.';
    let homeRemedies = 'Salt water rinse twice daily.';
    let followUpDays = 7;

    // Symptom-specific prescriptions
    if (symptomsLower.includes('severe pain') || symptomsLower.includes('throbbing')) {
      diagnosis = 'Acute dental pain';
      medications = [
        {
          name: 'Ibuprofen 600mg',
          dosage: '1 tablet',
          duration: '5 days',
          instructions: 'Take with food to prevent stomach upset',
          frequency: 'Every 8 hours'
        },
        {
          name: 'Acetaminophen 500mg',
          dosage: '2 tablets',
          duration: '5 days',
          instructions: 'Can alternate with ibuprofen every 4 hours',
          frequency: 'Every 6 hours'
        }
      ];
      generalInstructions = 'Avoid chewing on affected side. Apply cold compress for 15 minutes at a time.';
      followUpDays = 2;
    }
    else if (symptomsLower.includes('gum') && (symptomsLower.includes('bleeding') || symptomsLower.includes('swollen'))) {
      diagnosis = 'Gum inflammation (Gingivitis)';
      medications = [
        {
          name: 'Chlorhexidine Mouthwash 0.12%',
          dosage: '15ml',
          duration: '10 days',
          instructions: 'Rinse for 30 seconds, do not eat/drink for 30 mins after',
          frequency: 'Twice daily after brushing'
        },
        {
          name: 'Ibuprofen 400mg',
          dosage: '1 tablet',
          duration: '3 days',
          instructions: 'Take with food',
          frequency: 'Every 8 hours if needed for pain'
        }
      ];
      generalInstructions = 'Use soft-bristled toothbrush. Gentle flossing daily. Increase vitamin C intake.';
      homeRemedies = 'Warm salt water rinse 3 times daily. Turmeric paste application.';
      followUpDays = 10;
    }
    else if (symptomsLower.includes('wisdom tooth') || symptomsLower.includes('back tooth')) {
      diagnosis = 'Wisdom tooth related discomfort';
      medications = [
        {
          name: 'Ibuprofen 600mg',
          dosage: '1 tablet',
          duration: '7 days',
          instructions: 'Take with food, reduces inflammation',
          frequency: 'Every 8 hours'
        },
        {
          name: 'Amoxicillin 500mg',
          dosage: '1 capsule',
          duration: '7 days',
          instructions: 'Complete full course even if feeling better',
          frequency: 'Every 8 hours'
        }
      ];
      generalInstructions = 'Soft diet only. No smoking or alcohol. Keep area clean.';
      warnings = 'Seek immediate care if swelling increases or fever develops.';
      followUpDays = 3;
    }
    else if (symptomsLower.includes('sensitive') || symptomsLower.includes('cold') || symptomsLower.includes('hot')) {
      diagnosis = 'Dental hypersensitivity';
      medications = [
        {
          name: 'Sensodyne Toothpaste',
          dosage: 'Pea-sized amount',
          duration: '2 weeks',
          instructions: 'Leave on teeth for 2 minutes before rinsing',
          frequency: 'Twice daily'
        },
        {
          name: 'Fluoride Mouthwash',
          dosage: '10ml',
          duration: '2 weeks',
          instructions: 'Do not rinse with water after use',
          frequency: 'Once daily at bedtime'
        }
      ];
      generalInstructions = 'Avoid acidic foods/drinks. Use soft toothbrush. Avoid whitening toothpaste.';
      homeRemedies = 'Clove oil on cotton ball for temporary relief. Avoid extreme temperatures.';
      followUpDays = 14;
    }
    else if (symptomsLower.includes('extraction') || symptomsLower.includes('surgery') || symptomsLower.includes('pulled')) {
      diagnosis = 'Post-extraction care';
      medications = [
        {
          name: 'Amoxicillin 500mg',
          dosage: '1 capsule',
          duration: '7 days',
          instructions: 'Prevent infection, take with food',
          frequency: 'Every 8 hours'
        },
        {
          name: 'Ibuprofen 600mg',
          dosage: '1 tablet',
          duration: '5 days',
          instructions: 'Reduces swelling and pain',
          frequency: 'Every 8 hours with food'
        }
      ];
      generalInstructions = 'No spitting, smoking, or straws for 48 hours. Soft foods only. Gentle rinse after 24 hours.';
      warnings = 'Watch for dry socket - severe pain after 2-3 days requires immediate attention.';
      homeRemedies = 'Ice pack for first 24 hours. Warm salt water rinse after 24 hours.';
      followUpDays = 3;
    }
    else {
      // Generic toothache
      diagnosis = 'General dental discomfort';
      medications = [
        {
          name: 'Ibuprofen 400mg',
          dosage: '1-2 tablets',
          duration: '3 days',
          instructions: 'Anti-inflammatory, take with food',
          frequency: 'Every 6-8 hours as needed'
        }
      ];
      generalInstructions = 'Avoid hard foods. Maintain oral hygiene gently.';
      followUpDays = 5;
    }

    // Age-based adjustments
    if (patientAge < 18) {
      // Pediatric adjustments
      medications = medications.map(med => ({
        ...med,
        instructions: `PEDIATRIC DOSE - ${med.instructions}. Consult pediatric dentist for exact dosing.`
      }));
      warnings = `Age under 18 - all medications require pediatric dosing supervision. ${warnings}`;
    } else if (patientAge > 65) {
      // Geriatric considerations
      warnings = `Age over 65 - monitor for medication interactions. Check with physician if taking other medications. ${warnings}`;
    }

    return {
      success: true,
      data: {
        diagnosis,
        medications,
        generalInstructions,
        followUpDays,
        warnings,
        homeRemedies
      },
      aiModel: 'fallback-enhanced',
      tokensUsed: 0
    };
  }
}

module.exports = new GrokAIService();