import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Delete conversations (messages cascade via FK ON DELETE CASCADE)
    const { error: convError } = await supabase
      .from('conversations')
      .delete()
      .eq('user_id', user.id);

    if (convError) {
      console.error('Failed to delete conversations:', convError);
      return NextResponse.json(
        { error: 'Failed to clear conversations' },
        { status: 500 },
      );
    }

    // Delete financial profile
    const { error: profileError } = await supabase
      .from('financial_profiles')
      .delete()
      .eq('user_id', user.id);

    if (profileError) {
      console.error('Failed to delete financial profile:', profileError);
      return NextResponse.json(
        { error: 'Failed to clear profile' },
        { status: 500 },
      );
    }

    // Delete goals
    const { error: goalsError } = await supabase
      .from('goals')
      .delete()
      .eq('user_id', user.id);

    if (goalsError) {
      console.error('Failed to delete goals:', goalsError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/reset:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
