import { error } from '@sveltejs/kit';

/// データベースから取得した最低限のユーザー情報
type DbUserWithRoles = {
    id: number;
    clerkId: string;
    userRoles: {
        role: {
            name: string;
        };
    }[];
};

/// 権限の種類
export type Permission =
| 'CREATE_CATEGORY'
| 'EDIT_CATEGORY'
| 'DELETE_CATEGORY'
| 'CREATE_THREAD'
| 'EDIT_THREAD'
| 'DELETE_THREAD'
| 'POST_MESSAGE'
| 'EDIT_MESSAGE'
| 'DELETE_MESSAGE'
| 'UPDATE_USER_ROLE';

/// ロールごとの権限
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
    ADMIN: [
		'CREATE_CATEGORY',
        'EDIT_CATEGORY',
        'DELETE_CATEGORY',
		'CREATE_THREAD',
		'EDIT_THREAD',
		'DELETE_THREAD',
		'POST_MESSAGE',
		'EDIT_MESSAGE',
		'DELETE_MESSAGE',
		'UPDATE_USER_ROLE'
    ],
    SUB_ADMIN: [
        'CREATE_CATEGORY',
		'CREATE_THREAD',
		'POST_MESSAGE',
		'EDIT_MESSAGE',
		'DELETE_MESSAGE'
    ],
    USER: [
        'CREATE_THREAD',
		'POST_MESSAGE',
		'EDIT_MESSAGE',
		'DELETE_MESSAGE'
    ]
};

export function authorize(user: DbUserWithRoles, permission: Permission):void {
    if (!user) {
        throw error(403, '権限がありません');
    }

    const roleNames = user.userRoles.map((user) => user.role.name);

    const allowed = roleNames.some((roleName) => {
        const permissions = ROLE_PERMISSIONS[roleName];
        return permissions?.includes(permission);
    });

    if (!allowed) {
        throw error(403, '権限がありません');
    }
}