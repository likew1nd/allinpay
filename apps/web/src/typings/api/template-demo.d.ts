declare namespace Api.TemplateDemo {
  type User = Api.Common.CommonRecord<{
    userName: string;
    userGender: Api.SystemManage.UserGender | undefined;
    nickName: string;
    userPhone: string;
    userEmail: string;
    userRoles: string[];
  }>;
  type UserSearchParams = CommonType.RecordNullable<
    Pick<User, 'userName' | 'userGender' | 'nickName' | 'userPhone' | 'userEmail' | 'status'> &
      Api.Common.CommonSearchParams
  >;
  type UserList = Api.Common.PaginatingQueryRecord<User>;
}
