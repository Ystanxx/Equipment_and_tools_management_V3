from app.models.user import User


def test_pinyin_search_matches_index_and_name_updates(client, db, auth_headers, asset_type_ids):
    user = db.query(User).filter(User.username == 'admin_test').one()
    asset = client.post('/api/v1/assets', headers=auth_headers, json={
        'name': '拉曼光谱仪', 'admin_id': str(user.id), 'asset_type_id': asset_type_ids['固定资产'],
    }).json()['data']
    for keyword in ['guangpu', 'lm gpy', '光谱', 'GUANG PU']:
        response = client.get('/api/v1/assets', headers=auth_headers, params={'keyword': keyword})
        assert response.status_code == 200
        assert [a['id'] for a in response.json()['data']['items']] == [asset['id']]
    assert client.put('/api/v1/assets/' + asset['id'], headers=auth_headers,
                      json={'name': '示波器'}).status_code == 200
    assert client.get('/api/v1/assets?keyword=guangpu', headers=auth_headers).json()['data']['total'] == 0
    assert client.get('/api/v1/assets?keyword=shiboqi', headers=auth_headers).json()['data']['total'] == 1


