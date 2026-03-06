/**
 * Example test script for pre-login onboarding flow
 * 
 * This demonstrates the complete onboarding flow from start to finish.
 * Run with: tsx docs/examples/pre-login-onboarding-test.ts
 */

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  input_request?: any
  structured_response?: any
  created_at: string
}

interface OnboardingResponse {
  message: Message
  completed?: boolean
}

/**
 * Simulates a complete onboarding flow
 */
async function testOnboardingFlow() {
  const baseUrl = 'http://localhost:3000'
  let sessionCookie: string | null = null

  console.log('🚀 Starting pre-login onboarding test...\n')

  // Helper to make API calls with cookie
  async function makeRequest(
    method: 'GET' | 'POST',
    body?: any
  ): Promise<{ data: any; cookie?: string }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (sessionCookie) {
      headers['Cookie'] = sessionCookie
    }

    const response = await fetch(`${baseUrl}/api/onboarding/chat`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    // Extract cookie from response
    const setCookie = response.headers.get('set-cookie')
    if (setCookie) {
      const match = setCookie.match(/pre_login_session_id=([^;]+)/)
      if (match) {
        sessionCookie = `pre_login_session_id=${match[1]}`
      }
    }

    const data = await response.json()
    return { data, cookie: sessionCookie || undefined }
  }

  // Step 1: Start session (first question)
  console.log('📝 Step 1: Starting new session...')
  const step1 = await makeRequest('POST')
  console.log(`✅ Received: "${step1.data.message.content}"`)
  console.log(`🔐 Session cookie: ${sessionCookie?.substring(0, 50)}...`)
  console.log(`📋 Input type: ${step1.data.message.input_request.type}`)
  console.log(`📊 Options: ${step1.data.message.input_request.options.length}\n`)

  // Step 2: Answer age question
  console.log('📝 Step 2: Answering age question (26-35)...')
  const step2 = await makeRequest('POST', {
    content: '26–35',
    structured_response: {
      field: 'age_range',
      value: '26-35',
      source: 'structured_input',
      confidence: 1.0,
    },
  })
  console.log(`✅ Received: "${step2.data.message.content}"`)
  console.log(`📋 Next question: ${step2.data.message.input_request.field}\n`)

  // Step 3: Answer employment question
  console.log('📝 Step 3: Answering employment question (full-time)...')
  const step3 = await makeRequest('POST', {
    content: 'Full-time employed',
    structured_response: {
      field: 'employment_type',
      value: 'full_time',
      source: 'structured_input',
      confidence: 1.0,
    },
  })
  console.log(`✅ Received: "${step3.data.message.content}"`)
  console.log(`📋 Next question: ${step3.data.message.input_request.field}\n`)

  // Step 4: Answer income question
  console.log('📝 Step 4: Answering income question ($90K-$135K)...')
  const step4 = await makeRequest('POST', {
    content: '$90K–$135K',
    structured_response: {
      field: 'income_band',
      value: '90k_135k',
      source: 'structured_input',
      confidence: 1.0,
    },
  })
  console.log(`✅ Received: "${step4.data.message.content}"`)
  console.log(`📋 Next question: ${step4.data.message.input_request.field}\n`)

  // Step 5: Answer super balance question
  console.log('📝 Step 5: Answering super balance question ($150K-$400K)...')
  const step5 = await makeRequest('POST', {
    content: '$150K–$400K',
    structured_response: {
      field: 'super_balance_band',
      value: '150k_400k',
      source: 'structured_input',
      confidence: 1.0,
    },
  })
  console.log(`✅ Received: "${step5.data.message.content}"`)
  console.log(`📋 Next question: ${step5.data.message.input_request.field}\n`)

  // Step 6: Answer goal question
  console.log('📝 Step 6: Answering goal question (buy a house)...')
  const step6 = await makeRequest('POST', {
    content: "I want to buy my first home in the next 3-5 years. I'm not sure if I'm saving enough or if I should be doing something differently with my money.",
    structured_response: {
      field: 'goal_text',
      value: "I want to buy my first home in the next 3-5 years. I'm not sure if I'm saving enough or if I should be doing something differently with my money.",
      source: 'structured_input',
      confidence: 1.0,
    },
  })
  console.log(`✅ Received: "${step6.data.message.content}"`)
  console.log(`🎉 Completed: ${step6.data.completed}\n`)

  // Step 7: Check session state
  console.log('📝 Step 7: Checking session state...')
  const sessionState = await makeRequest('GET')
  console.log(`✅ Session data:`, JSON.stringify(sessionState.data.session_data, null, 2))
  console.log(`📊 Message count: ${sessionState.data.message_count}`)
  console.log(`✅ Completed: ${sessionState.data.completed}\n`)

  console.log('🎊 Onboarding flow test completed successfully!')
}

/**
 * Test rate limiting
 */
async function testRateLimiting() {
  const baseUrl = 'http://localhost:3000'

  console.log('\n🔒 Testing rate limiting...\n')

  for (let i = 1; i <= 4; i++) {
    console.log(`Attempt ${i}/4: Creating new session...`)
    
    const response = await fetch(`${baseUrl}/api/onboarding/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (response.ok) {
      console.log(`✅ Session ${i} created successfully`)
    } else {
      console.log(`❌ Session ${i} failed: ${response.status} ${response.statusText}`)
      const error = await response.json()
      console.log(`   Error: ${error.error}`)
    }
  }

  console.log('\n💡 Note: Rate limit is 3 sessions per IP per hour')
  console.log('   The 4th attempt should fail with HTTP 429\n')
}

/**
 * Test message limit
 */
async function testMessageLimit() {
  const baseUrl = 'http://localhost:3000'
  let sessionCookie: string | null = null

  console.log('\n📊 Testing message limit...\n')

  // Create session
  const response = await fetch(`${baseUrl}/api/onboarding/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  const setCookie = response.headers.get('set-cookie')
  if (setCookie) {
    const match = setCookie.match(/pre_login_session_id=([^;]+)/)
    if (match) {
      sessionCookie = `pre_login_session_id=${match[1]}`
    }
  }

  console.log(`✅ Session created\n`)

  // Send 10 messages (20 total including responses)
  for (let i = 1; i <= 10; i++) {
    const res = await fetch(`${baseUrl}/api/onboarding/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': sessionCookie!,
      },
      body: JSON.stringify({
        content: `Test message ${i}`,
        structured_response: {
          field: 'age_range',
          value: '26-35',
          source: 'structured_input',
          confidence: 1.0,
        },
      }),
    })

    if (res.ok) {
      console.log(`✅ Message ${i * 2}/20 sent`)
    } else {
      console.log(`❌ Message ${i * 2} failed: ${res.status}`)
      const error = await res.json()
      console.log(`   Error: ${error.error}`)
      break
    }
  }

  console.log('\n💡 Note: Message limit is 20 per session')
  console.log('   The 21st message should fail with HTTP 429\n')
}

/**
 * Run all tests
 */
async function runTests() {
  try {
    // Test 1: Complete onboarding flow
    await testOnboardingFlow()

    // Test 2: Rate limiting (commented out to avoid hitting rate limit)
    // await testRateLimiting()

    // Test 3: Message limit (commented out to avoid cluttering)
    // await testMessageLimit()

    console.log('\n✨ All tests completed!\n')
  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests()
}

export { testOnboardingFlow, testRateLimiting, testMessageLimit }
